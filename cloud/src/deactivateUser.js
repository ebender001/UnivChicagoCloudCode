async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can delete users.");
	}
}

Parse.Cloud.define("deactivateUser", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to delete users.");
	}

	await requireSuperAdmin(request.user);

	const userId = request.params && request.params.userId;
	if (!userId || typeof userId !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "User id is required.");
	}

	if (userId === request.user.id) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "You cannot delete your own user account.");
	}

	const query = new Parse.Query(Parse.User);
	const user = await query.get(userId, { useMasterKey: true });
	// Users are deactivated instead of deleted so audit trails and pointers remain valid.
	user.set("isActive", false);

	const savedUser = await user.save(null, { useMasterKey: true });

	return {
		objectId: savedUser.id,
		name: savedUser.get("name") || savedUser.get("username") || savedUser.get("email") || "",
		isActive: savedUser.get("isActive") === true
	};
});
