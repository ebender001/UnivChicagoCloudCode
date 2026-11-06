// Shared, case-insensitive user lookup and login helpers.

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Finds a user by username (any capitalization) or by email.
async function findUserByLoginName(loginName) {
	const byUsername = new Parse.Query(Parse.User);
	byUsername.matches("username", new RegExp(`^${escapeRegex(loginName)}$`, "i"));
	const usernameMatches = await byUsername.find({ useMasterKey: true });

	// Prefer an exact-case match if legacy data has several case variants.
	const exact = usernameMatches.find((user) => user.get("username") === loginName);
	if (exact) return exact;
	if (usernameMatches.length) return usernameMatches[0];

	if (loginName.includes("@")) {
		const byEmail = new Parse.Query(Parse.User);
		byEmail.equalTo("email", loginName.toLowerCase());
		return byEmail.first({ useMasterKey: true });
	}

	return null;
}

// Logs in with the typed name, then falls back to a case-insensitive username/email lookup.
async function loginWithUsernameOrEmail(loginName, password) {
	try {
		return await Parse.User.logIn(loginName, password);
	} catch (error) {
		console.log("Login failed with submitted username.", { code: error.code, username: loginName });
	}

	const user = await findUserByLoginName(loginName);
	const storedUsername = user ? user.get("username") : "";
	if (!storedUsername || storedUsername === loginName) {
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
	}

	try {
		return await Parse.User.logIn(storedUsername, password);
	} catch (resolvedError) {
		console.log("Login failed after resolving username.", {
			code: resolvedError.code,
			submitted: loginName,
			resolvedUsername: storedUsername
		});
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
	}
}

module.exports = { findUserByLoginName, loginWithUsernameOrEmail };
