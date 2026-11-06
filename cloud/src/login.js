const { loginWithUsernameOrEmail } = require("./userLookup.js");

Parse.Cloud.define("login", async (request) => {
	const { username, password } = request.params || {};

	if (!username || typeof username !== "string" || !username.trim()) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Username is required.");
	}

	if (!password || typeof password !== "string" || !password) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Password is required.");
	}

	const loginName = username.trim();
	const user = await loginWithUsernameOrEmail(loginName, password);

	let profileUser = user;

	try {
		const profileQuery = new Parse.Query(Parse.User);
		profileQuery.include(["institution", "specialty"]);
		profileUser = await profileQuery.get(user.id, { useMasterKey: true });
	} catch (error) {
		console.log("Login succeeded, but profile pointers could not be loaded.", {
			code: error.code,
			userId: user.id
		});
	}

	const institution = profileUser.get("institution");
	const specialty = profileUser.get("specialty");
	const isActive = profileUser.get("isActive") === true;

	if (!isActive) {
		// Keep inactive-user failures generic so the login form does not reveal account state.
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Login failed.");
	}

	return {
		objectId: user.id,
		name: profileUser.get("name") || null,
		username: profileUser.get("username"),
		email: profileUser.get("email") || null,
		role: profileUser.get("role") || null,
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
