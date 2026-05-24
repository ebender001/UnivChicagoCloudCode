Parse.Cloud.define("login", async (request) => {
	const { username, password } = request.params || {};

	if (!username || typeof username !== "string" || !username.trim()) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Username is required.");
	}

	if (!password || typeof password !== "string" || !password) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Password is required.");
	}

	const loginName = username.trim();
	let user;

	try {
		user = await Parse.User.logIn(loginName, password);
	} catch (error) {
		console.log("Login failed with submitted username.", {
			code: error.code,
			username: loginName
		});

		if (!loginName.includes("@")) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
		}

		// Allow staff to enter email even when Parse username is a separate value.
		const userQuery = new Parse.Query(Parse.User);
		userQuery.equalTo("email", loginName);

		const userByEmail = await userQuery.first({ useMasterKey: true });
		if (!userByEmail || !userByEmail.get("username")) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
		}

		try {
			user = await Parse.User.logIn(userByEmail.get("username"), password);
		} catch (emailLoginError) {
			console.log("Login failed after resolving email to username.", {
				code: emailLoginError.code,
				email: loginName,
				resolvedUsername: userByEmail.get("username")
			});

			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid username or password.");
		}
	}

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
