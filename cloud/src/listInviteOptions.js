const { dataAccessScopeForRole, getInviteRolesForUser } = require("./roleAccess.js");

function serializeOption(object) {
	return {
		objectId: object.id,
		name: object.get("name") || ""
	};
}

async function listNamedOptions(className, constraints) {
	const query = new Parse.Query(className);
	query.exists("name");
	if (className === "Institution" || className === "Specialty") {
		// Invite forms should not offer soft-deleted admin options.
		query.equalTo("isActive", true);
	}
	query.ascending("name");
	query.limit(1000);
	if (typeof constraints === "function") constraints(query);

	const results = await query.find({ useMasterKey: true });
	return results
		.map(serializeOption)
		.filter((option) => option.name);
}

Parse.Cloud.define("listInviteOptions", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to load invite options.");
	}

	const roleQuery = new Parse.Query(Parse.User);
	roleQuery.include(["institution", "specialty"]);
	const currentUser = await roleQuery.get(request.user.id, { useMasterKey: true });
	const accessScope = dataAccessScopeForRole(currentUser.get("role"));
	const currentInstitution = currentUser.get("institution");

	if (accessScope === "institution" && !currentInstitution) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution to invite dashboard users.");
	}

	const [institutions, specialties] = await Promise.all([
		listNamedOptions("Institution", (query) => {
			if (accessScope === "institution" && currentInstitution) {
				query.equalTo("objectId", currentInstitution.id);
			}
		}),
		listNamedOptions("Specialty")
	]);
	const roles = await getInviteRolesForUser(currentUser.get("role"));

	return {
		institutions,
		specialties,
		roles
	};
});
