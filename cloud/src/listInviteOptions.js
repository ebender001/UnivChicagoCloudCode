function serializeOption(object) {
	return {
		objectId: object.id,
		name: object.get("name") || ""
	};
}

async function listNamedOptions(className) {
	const query = new Parse.Query(className);
	query.exists("name");
	if (className === "Institution" || className === "Specialty") {
		// Invite forms should not offer soft-deleted admin options.
		query.equalTo("isActive", true);
	}
	query.ascending("name");
	query.limit(1000);

	const results = await query.find({ useMasterKey: true });
	return results
		.map(serializeOption)
		.filter((option) => option.name);
}

Parse.Cloud.define("listInviteOptions", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to load invite options.");
	}

	const [institutions, specialties] = await Promise.all([
		listNamedOptions("Institution"),
		listNamedOptions("Specialty")
	]);

	return {
		institutions,
		specialties
	};
});
