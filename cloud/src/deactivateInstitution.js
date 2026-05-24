async function requireSuperAdmin(user) {
	const query = new Parse.Query(Parse.User);
	const fullUser = await query.get(user.id, { useMasterKey: true });

	if (fullUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can delete institutions.");
	}
}

Parse.Cloud.define("deactivateInstitution", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to delete institutions.");
	}

	await requireSuperAdmin(request.user);

	const institutionId = request.params && request.params.institutionId;
	if (!institutionId || typeof institutionId !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Institution id is required.");
	}

	const query = new Parse.Query("Institution");
	const institution = await query.get(institutionId, { useMasterKey: true });
	// Admin delete is a soft delete so historical pointers remain intact.
	institution.set("isActive", false);

	const savedInstitution = await institution.save(null, { useMasterKey: true });

	return {
		objectId: savedInstitution.id,
		name: savedInstitution.get("name") || "",
		isActive: savedInstitution.get("isActive") === true
	};
});
