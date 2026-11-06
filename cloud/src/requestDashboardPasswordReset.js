const { findUserByLoginName } = require("./userLookup.js");

function normalizeLoginName(value) {
	return typeof value === "string" ? value.trim() : "";
}

Parse.Cloud.define("requestDashboardPasswordReset", async (request) => {
	const { username } = request.params || {};
	const loginName = normalizeLoginName(username);

	if (!loginName) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Username or email is required.");
	}

	const user = await findUserByLoginName(loginName);
	const email = user && typeof user.get("email") === "string"
		? user.get("email").trim().toLowerCase()
		: "";
	const isActive = user && user.get("isActive") === true;

	if (email && isActive) {
		await Parse.User.requestPasswordReset(email);
	}

	// Keep responses generic so the endpoint does not reveal whether an account exists.
	return {
		success: true
	};
});
