function normalizeInstitutionName(value) {
	return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can add institutions.");
	}
}

Parse.Cloud.define("createInstitution", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to add institutions.");
	}

	await requireSuperAdmin(request.user);

	const name = normalizeInstitutionName(request.params && request.params.name);
	if (!name) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Institution name is required.");
	}

	const duplicateQuery = new Parse.Query("Institution");
	// Treat capitalization-only variants as duplicates.
	duplicateQuery.matches("name", `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

	const duplicate = await duplicateQuery.first({ useMasterKey: true });
	if (duplicate) {
		throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, "An institution with that name already exists.");
	}

	const Institution = Parse.Object.extend("Institution");
	const institution = new Institution();
	institution.set("name", name);
	institution.set("isActive", true);

	const savedInstitution = await institution.save(null, { useMasterKey: true });

	return {
		objectId: savedInstitution.id,
		name: savedInstitution.get("name"),
		isActive: savedInstitution.get("isActive") === true
	};
});
