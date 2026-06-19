function normalizeString(value) {
	return typeof value === "string" ? value.trim() : "";
}

const { setGeneratedPin } = require("./pinUtils.js");

async function ensureUniqueUsername(username, userId) {
	const query = new Parse.Query(Parse.User);
	query.equalTo("username", username);

	const existing = await query.first({ useMasterKey: true });
	if (existing && existing.id !== userId) {
		throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, "That username is already in use.");
	}
}

Parse.Cloud.define("activateDashboardUserInvite", async (request) => {
	const payload = request.params || {};
	const token = normalizeString(payload.token);
	const username = normalizeString(payload.username);
	const password = typeof payload.password === "string" ? payload.password : "";

	if (!token) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Invitation token is required.");
	}

	if (!username) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Username is required.");
	}

	if (password.length < 8) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Password must be at least 8 characters.");
	}

	const query = new Parse.Query(Parse.User);
	query.equalTo("inviteToken", token);

	const user = await query.first({ useMasterKey: true });
	if (!user) {
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invitation link is invalid or expired.");
	}

	if (user.get("isActive") === true) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "This invitation has already been accepted.");
	}

	const expiresAt = user.get("inviteExpiresAt");
	if (expiresAt instanceof Date && expiresAt.getTime() < Date.now()) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Invitation link is invalid or expired.");
	}

	await ensureUniqueUsername(username, user.id);

	// Activating an invite replaces the temporary username/password and clears one-time token fields.
	user.set("username", username);
	user.set("password", password);
	user.set("isActive", true);
	user.set("emailVerified", true);
	const pin = setGeneratedPin(user);
	user.unset("inviteToken");
	user.unset("inviteExpiresAt");

	const savedUser = await user.save(null, { useMasterKey: true });

	return {
		objectId: savedUser.id,
		username: savedUser.get("username"),
		email: savedUser.get("email"),
		isActive: savedUser.get("isActive") === true,
		pin
	};
});
