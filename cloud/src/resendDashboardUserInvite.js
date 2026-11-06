const { canInviteRole, dataAccessScopeForRole, getRoleByName } = require("./roleAccess.js");
const { randomToken, sendInviteEmail, getFullUser } = require("./createDashboardUserInvite.js");

Parse.Cloud.define("resendDashboardUserInvite", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to resend invitations.");
	}

	const payload = request.params || {};
	const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
	const activationBaseUrl = typeof payload.activationBaseUrl === "string" ? payload.activationBaseUrl.trim() : "";

	if (!userId) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "User is required.");
	}

	if (!activationBaseUrl) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Activation page URL is required.");
	}

	const inviter = await getFullUser(request.user);
	const inviterRole = inviter.get("role");

	const query = new Parse.Query(Parse.User);
	query.include(["institution"]);
	let invitedUser;
	try {
		invitedUser = await query.get(userId, { useMasterKey: true });
	} catch (error) {
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "User not found.");
	}

	// Only users with an outstanding invitation can be re-invited (not deleted/deactivated users).
	if (invitedUser.get("isActive") === true || !invitedUser.get("inviteToken")) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "This user does not have a pending invitation.");
	}

	const role = invitedUser.get("role") || "";
	const invitedRole = await getRoleByName(role);
	if (!invitedRole || !(await canInviteRole(inviterRole, role))) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You cannot invite a user with that role.");
	}

	if (dataAccessScopeForRole(inviterRole) === "institution") {
		const inviterInstitution = inviter.get("institution");
		const invitedInstitution = invitedUser.get("institution");
		if (!inviterInstitution || !invitedInstitution || invitedInstitution.id !== inviterInstitution.id) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You can only invite dashboard users for your institution.");
		}
	}

	// A new token invalidates any earlier invitation link.
	const inviteToken = randomToken();
	const inviteExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
	const activationUrl = `${activationBaseUrl}?token=${encodeURIComponent(inviteToken)}`;
	const email = invitedUser.get("email");

	invitedUser.set("inviteToken", inviteToken);
	invitedUser.set("inviteExpiresAt", inviteExpiresAt);
	await invitedUser.save(null, { useMasterKey: true });

	await sendInviteEmail({
		email,
		name: invitedUser.get("name") || "",
		role,
		roleRecord: invitedRole,
		activationUrl
	});

	return {
		objectId: invitedUser.id,
		email,
		inviteExpiresAt
	};
});
