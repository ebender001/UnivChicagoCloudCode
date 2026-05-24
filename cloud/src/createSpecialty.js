function normalizeSpecialtyName(value) {
	return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can add specialties.");
	}
}

Parse.Cloud.define("createSpecialty", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to add specialties.");
	}

	await requireSuperAdmin(request.user);

	const name = normalizeSpecialtyName(request.params && request.params.name);
	if (!name) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Specialty name is required.");
	}

	const duplicateQuery = new Parse.Query("Specialty");
	// Treat capitalization-only variants as duplicates.
	duplicateQuery.matches("name", `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

	const duplicate = await duplicateQuery.first({ useMasterKey: true });
	if (duplicate) {
		throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, "A specialty with that name already exists.");
	}

	const Specialty = Parse.Object.extend("Specialty");
	const specialty = new Specialty();
	specialty.set("name", name);
	specialty.set("isActive", true);

	const savedSpecialty = await specialty.save(null, { useMasterKey: true });

	return {
		objectId: savedSpecialty.id,
		name: savedSpecialty.get("name"),
		isActive: savedSpecialty.get("isActive") === true
	};
});
