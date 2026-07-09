function pointerName(pointer) {
	return pointer ? pointer.get("name") || "" : "";
}

function serializeUser(user, roleDisplayNames) {
	const role = user.get("role") || "";
	return {
		objectId: user.id,
		name: user.get("name") || user.get("username") || user.get("email") || "",
		role,
		roleDisplayName: roleDisplayNames[role] || role,
		institutionName: pointerName(user.get("institution")),
		specialtyName: pointerName(user.get("specialty")),
		isActive: user.get("isActive") === true
	};
}

async function loadRoleDisplayNames() {
	const query = new Parse.Query(Parse.Role);
	query.exists("name");
	query.limit(1000);

	const roles = await query.find({ useMasterKey: true });
	return roles.reduce((map, role) => {
		const name = role.get("name") || "";
		if (!name) return map;
		map[name] = role.get("displayName") || name;
		return map;
	}, {});
}

async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can manage users.");
	}
}

Parse.Cloud.define("listUsers", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list users.");
	}

	await requireSuperAdmin(request.user);

	const query = new Parse.Query(Parse.User);
	query.include(["institution", "specialty"]);
	query.ascending("name");
	query.limit(1000);

	const [users, roleDisplayNames] = await Promise.all([
		query.find({ useMasterKey: true }),
		loadRoleDisplayNames()
	]);

	return {
		results: users.map((user) => serializeUser(user, roleDisplayNames))
	};
});
