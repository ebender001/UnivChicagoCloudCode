function serializeInstitution(institution) {
	return {
		objectId: institution.id,
		name: institution.get("name") || "",
		isActive: institution.get("isActive") === true
	};
}

async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can manage institutions.");
	}
}

Parse.Cloud.define("listInstitutions", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list institutions.");
	}

	await requireSuperAdmin(request.user);

	const query = new Parse.Query("Institution");
	query.equalTo("isActive", true);
	query.exists("name");
	query.ascending("name");
	query.limit(1000);

	const institutions = await query.find({ useMasterKey: true });

	return {
		results: institutions.map(serializeInstitution)
	};
});
