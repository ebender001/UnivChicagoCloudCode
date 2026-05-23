Parse.Cloud.define("login", async (request) => {
	const { username, password } = request.params || {};

	if (!username || typeof username !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Username is required.");
	}

	if (!password || typeof password !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Password is required.");
	}

	const user = await Parse.User.logIn(username, password);

	await user.fetchWithInclude(["institution", "specialty"]);

	const institution = user.get("institution");
	const specialty = user.get("specialty");

	return {
		objectId: user.id,
		username: user.get("username"),
		email: user.get("email") || null,
		sessionToken: user.getSessionToken(),
		institution: institution
			? {
				objectId: institution.id,
				name: institution.get("name") || null
			}
			: null,
		specialty: specialty
			? {
				objectId: specialty.id,
				name: specialty.get("name") || null
			}
			: null
	};
});
