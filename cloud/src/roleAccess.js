const superAdminRoleName = "super_admin";
const studyAdminRoleName = "study_admin";
const inviteAccessLimitRoleName = "study_coordinator";
const institutionDataAccessRoleName = "study_coordinator";

function normalizeRoleName(roleName) {
	return typeof roleName === "string"
		? roleName.trim().toLowerCase().replace(/[\s-]+/g, "_")
		: "";
}

function roleOrder(role) {
	const value = Number(role && role.get("order"));
	return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function serializeRole(role) {
	return {
		objectId: role.id,
		name: role.get("name") || "",
		displayName: role.get("displayName") || role.get("name") || "",
		description: role.get("description") || "",
		order: roleOrder(role)
	};
}

async function getRoleByName(name) {
	if (!name) return null;

	const query = new Parse.Query(Parse.Role);
	query.equalTo("name", name);
	return query.first({ useMasterKey: true });
}

async function listRoles() {
	const query = new Parse.Query(Parse.Role);
	query.exists("name");
	query.ascending("order");
	query.addAscending("name");
	query.limit(1000);
	return query.find({ useMasterKey: true });
}

async function getInviteRolesForUser(currentRoleName) {
	const roles = await listRoles();
	const currentRole = roles.find((role) => role.get("name") === currentRoleName);
	const inviteAccessLimitRole = roles.find((role) => role.get("name") === inviteAccessLimitRoleName);

	if (!currentRole || !inviteAccessLimitRole) return [];

	const currentOrder = roleOrder(currentRole);
	if (currentOrder > roleOrder(inviteAccessLimitRole)) return [];

	return roles
		.filter((role) => role.get("name") !== superAdminRoleName)
		.filter((role) => roleOrder(role) >= currentOrder)
		.map(serializeRole);
}

async function canInviteRole(currentRoleName, invitedRoleName) {
	const allowedRoles = await getInviteRolesForUser(currentRoleName);
	return allowedRoles.some((role) => role.name === invitedRoleName);
}

function hasAllDataAccess(roleName) {
	const normalizedRoleName = normalizeRoleName(roleName);
	return normalizedRoleName === superAdminRoleName || normalizedRoleName === studyAdminRoleName;
}

function hasInstitutionDataAccess(roleName) {
	return hasAllDataAccess(roleName) || normalizeRoleName(roleName) === institutionDataAccessRoleName;
}

function dataAccessScopeForRole(roleName) {
	if (hasAllDataAccess(roleName)) return "all";
	if (normalizeRoleName(roleName) === institutionDataAccessRoleName) return "institution";
	return "institution_specialty";
}

async function exportScopeForRole(roleName) {
	if (hasAllDataAccess(roleName)) return "all";

	const [role, institutionScopeLimitRole] = await Promise.all([
		getRoleByName(roleName),
		getRoleByName(inviteAccessLimitRoleName)
	]);

	if (role && institutionScopeLimitRole && roleOrder(role) <= roleOrder(institutionScopeLimitRole)) {
		return "institution";
	}

	throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your role does not allow data downloads.");
}

module.exports = {
	canInviteRole,
	dataAccessScopeForRole,
	exportScopeForRole,
	getRoleByName,
	getInviteRolesForUser,
	hasAllDataAccess,
	hasInstitutionDataAccess
};
