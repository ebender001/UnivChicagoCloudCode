async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can delete specialties.");
	}
}

Parse.Cloud.define("deactivateSpecialty", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to delete specialties.");
	}

	await requireSuperAdmin(request.user);

	const specialtyId = request.params && request.params.specialtyId;
	if (!specialtyId || typeof specialtyId !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Specialty id is required.");
	}

	const query = new Parse.Query("Specialty");
	const specialty = await query.get(specialtyId, { useMasterKey: true });
	// Admin delete is a soft delete so historical pointers remain intact.
	specialty.set("isActive", false);

	const savedSpecialty = await specialty.save(null, { useMasterKey: true });

	return {
		objectId: savedSpecialty.id,
		name: savedSpecialty.get("name") || "",
		isActive: savedSpecialty.get("isActive") === true
	};
});
