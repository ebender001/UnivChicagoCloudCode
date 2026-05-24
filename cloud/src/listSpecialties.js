function serializeSpecialty(specialty) {
	return {
		objectId: specialty.id,
		name: specialty.get("name") || "",
		isActive: specialty.get("isActive") === true
	};
}

async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can manage specialties.");
	}
}

Parse.Cloud.define("listSpecialties", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list specialties.");
	}

	await requireSuperAdmin(request.user);

	const query = new Parse.Query("Specialty");
	query.equalTo("isActive", true);
	query.exists("name");
	query.ascending("name");
	query.limit(1000);

	const specialties = await query.find({ useMasterKey: true });

	return {
		results: specialties.map(serializeSpecialty)
	};
});
