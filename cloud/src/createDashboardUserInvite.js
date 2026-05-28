const { canInviteRole, getRoleByName } = require("./roleAccess.js");
const https = require("https");

function randomPassword() {
	return `Invite-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function randomToken() {
	const first = Math.random().toString(36).slice(2);
	const second = Math.random().toString(36).slice(2);
	return `${first}${second}${Date.now().toString(36)}`;
}

function normalizeEmail(value) {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function getFullUser(user) {
	const query = new Parse.Query(Parse.User);
	return query.get(user.id, { useMasterKey: true });
}

async function ensureUniqueUser(email) {
	const query = new Parse.Query(Parse.User);
	query.equalTo("email", email);

	const existing = await query.first({ useMasterKey: true });
	if (existing) {
		throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, "A dashboard user with that email already exists.");
	}
}

function roleLabel(role, roleRecord) {
	return roleRecord && roleRecord.get("displayName")
		? roleRecord.get("displayName")
		: role;
}

function roleBodyText(roleRecord) {
	return roleRecord && roleRecord.get("description")
		? roleRecord.get("description")
		: "You have been invited to use the BeFitMe dashboard.";
}

function inviteEmailHtml({ name, role, roleRecord, activationUrl }) {
	const greeting = name ? `Hello ${name},` : "Hello,";

	return [
		`<p>${greeting}</p>`,
		`<p>${roleBodyText(roleRecord)}</p>`,
		`<p>Use the link below to choose your username and password.</p>`,
		`<p><a href="${activationUrl}">Accept BeFitMe invitation</a></p>`,
		`<p>This invitation creates a ${roleLabel(role, roleRecord)} dashboard account.</p>`,
		`<p>Thank you.</p>`
	].join("");
}

function inviteEmailText({ name, role, roleRecord, activationUrl }) {
	const greeting = name ? `Hello ${name},` : "Hello,";

	return [
		greeting,
		"",
		roleBodyText(roleRecord),
		"",
		"Use the link below to choose your username and password.",
		"",
		activationUrl,
		"",
		`This invitation creates a ${roleLabel(role, roleRecord)} dashboard account.`,
		"",
		"Thank you."
	].join("\n");
}

async function sendInviteEmail({ email, name, role, roleRecord, activationUrl }) {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		throw new Parse.Error(Parse.Error.SCRIPT_FAILED, "RESEND_API_KEY is not configured.");
	}

	const from = process.env.RESEND_FROM_EMAIL || "BeFitMe <admin@befitme.app>";
	const body = JSON.stringify({
		from,
		to: [email],
		subject: "BeFitMe User Invitation",
		html: inviteEmailHtml({ name, role, roleRecord, activationUrl }),
		text: inviteEmailText({ name, role, roleRecord, activationUrl })
	});

	// Back4App's Parse runtime does not expose Parse.Cloud.httpRequest here, so use https directly.
	await new Promise((resolve, reject) => {
		const request = https.request({
			method: "POST",
			hostname: "api.resend.com",
			path: "/emails",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(body)
			}
		}, (response) => {
			let responseBody = "";

			response.on("data", (chunk) => {
				responseBody += chunk;
			});

			response.on("end", () => {
				if (response.statusCode >= 200 && response.statusCode < 300) {
					resolve(responseBody);
					return;
				}

				reject(new Parse.Error(
					Parse.Error.SCRIPT_FAILED,
					`Resend email failed with status ${response.statusCode}: ${responseBody}`
				));
			});
		});

		request.on("error", (error) => {
			reject(new Parse.Error(Parse.Error.SCRIPT_FAILED, error.message));
		});

		request.write(body);
		request.end();
	});
}

Parse.Cloud.define("createDashboardUserInvite", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to invite dashboard users.");
	}

	const payload = request.params || {};
	const email = normalizeEmail(payload.email);
	const name = typeof payload.name === "string" ? payload.name.trim() : "";
	const role = typeof payload.role === "string" ? payload.role.trim() : "";
	const institutionId = typeof payload.institutionId === "string" ? payload.institutionId.trim() : "";
	const specialtyId = typeof payload.specialtyId === "string" ? payload.specialtyId.trim() : "";
	const activationBaseUrl = typeof payload.activationBaseUrl === "string" ? payload.activationBaseUrl.trim() : "";

	if (!email || !email.includes("@")) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "A valid email is required.");
	}

	if (!institutionId) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Institution is required.");
	}

	if (!specialtyId) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Specialty is required.");
	}

	if (!activationBaseUrl) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Activation page URL is required.");
	}

	const inviter = await getFullUser(request.user);
	const inviterRole = inviter.get("role");
	const invitedRole = await getRoleByName(role);
	if (!invitedRole || !(await canInviteRole(inviterRole, role))) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You cannot invite a user with that role.");
	}

	await ensureUniqueUser(email);

	const institution = Parse.Object.extend("Institution").createWithoutData(institutionId);
	const specialty = Parse.Object.extend("Specialty").createWithoutData(specialtyId);
	const invitedUser = new Parse.User();
	const inviteToken = randomToken();
	const inviteExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
	const activationUrl = `${activationBaseUrl}?token=${encodeURIComponent(inviteToken)}`;

	// The account is created inactive. The emailed token lets the invitee set final credentials.
	invitedUser.set("username", email);
	invitedUser.set("email", email);
	invitedUser.set("password", randomPassword());
	invitedUser.set("isActive", false);
	invitedUser.set("emailVerified", false);
	invitedUser.set("role", role);
	invitedUser.set("institution", institution);
	invitedUser.set("specialty", specialty);
	invitedUser.set("inviteToken", inviteToken);
	invitedUser.set("inviteExpiresAt", inviteExpiresAt);

	if (name) invitedUser.set("name", name);

	const savedUser = await invitedUser.signUp(null, { useMasterKey: true });
	invitedRole.getUsers().add(savedUser);
	await invitedRole.save(null, { useMasterKey: true });
	await sendInviteEmail({ email, name, role, roleRecord: invitedRole, activationUrl });

	return {
		objectId: savedUser.id,
		email: savedUser.get("email"),
		name: savedUser.get("name") || null,
		role: savedUser.get("role"),
		isActive: savedUser.get("isActive") === true,
		inviteExpiresAt
	};
});
