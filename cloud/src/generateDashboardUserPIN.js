const { setGeneratedPin } = require("./pinUtils.js");

function normalizeString(value) {
	return typeof value === "string" ? value.trim() : "";
}

async function loginWithUsernameOrEmail(loginName, password) {
	try {
		return await Parse.User.logIn(loginName, password);
	} catch (error) {
		if (!loginName.includes("@")) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
		}

		const userQuery = new Parse.Query(Parse.User);
		userQuery.equalTo("email", loginName);

		const userByEmail = await userQuery.first({ useMasterKey: true });
		if (!userByEmail || !userByEmail.get("username")) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
		}

		try {
			return await Parse.User.logIn(userByEmail.get("username"), password);
		} catch (emailLoginError) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
		}
	}
}

Parse.Cloud.define("generateDashboardUserPIN", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "Login is required.");
	}

	const { username, password } = request.params || {};
	const loginName = normalizeString(username);

	if (!loginName) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Username is required.");
	}

	if (!password || typeof password !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Password is required.");
	}

	const authenticatedUser = await loginWithUsernameOrEmail(loginName, password);

	if (authenticatedUser.id !== request.user.id) {
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
	}

	const userQuery = new Parse.Query(Parse.User);
	const user = await userQuery.get(request.user.id, { useMasterKey: true });
	const pin = setGeneratedPin(user);
	const savedUser = await user.save(null, { useMasterKey: true });

	return {
		objectId: savedUser.id,
		pin
	};
});
