Parse.Cloud.define("requestDashboardPasswordReset", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "Login is required.");
	}

	const userQuery = new Parse.Query(Parse.User);
	const user = await userQuery.get(request.user.id, { useMasterKey: true });
	const email = user.get("email");

	if (!email || typeof email !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "No email address is available for this user.");
	}

	await Parse.User.requestPasswordReset(email);

	return {
		email
	};
});
