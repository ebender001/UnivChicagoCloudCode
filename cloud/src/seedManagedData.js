const SEEDED_AT_FIELD = "managedSeededAt";
const SEEDED_BATCH_FIELD = "managedSeedBatchKey";
const IS_SEED_DATA_FIELD = "isSeedData";
const WATCH_START_NUMBER = 100;
const WATCH_COUNT = 5;
const WATCH_DATA_ENTRY_COUNT = 10;
const UNENROLLED_SURVEY_COUNT = 6;
const ENROLLEE_COUNT = 14;
const TOTAL_MANAGED_ENTRY_COUNT = ENROLLEE_COUNT + UNENROLLED_SURVEY_COUNT;
const SEEDED_CLASS_NAMES = ["HeartRate", "Pedometer", "Exercise", "WatchDevice", "Survey", "Enrollee"];

function makeAcl(user) {
	const acl = new Parse.ACL(user);
	acl.setPublicReadAccess(false);
	acl.setPublicWriteAccess(false);
	return acl;
}

function addDays(baseDate, dayOffset) {
	const value = new Date(baseDate);
	value.setUTCDate(value.getUTCDate() + dayOffset);
	return value;
}

function seedBatchKeyForUser(userId) {
	return `managed-seed:${userId}`;
}

function makeSeedKey(batchKey, kind, index) {
	return `${batchKey}:${kind}:${index}`;
}

async function loadCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include(["institution", "specialty"]);
	return query.get(user.id, { useMasterKey: true });
}

async function requireSuperAdmin(user) {
	const currentUser = await loadCurrentUser(user);

	if (currentUser.get("role") !== "super_admin") {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can delete managed seed data.");
	}

	return currentUser;
}

function requireScope(user) {
	const institution = user.get("institution");
	const specialty = user.get("specialty");

	if (!institution) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Your user account needs an institution before seeding data.");
	}

	if (!specialty) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Your user account needs a specialty before seeding data.");
	}

	return { institution, specialty };
}

async function findBySeedKey(className, seedKey) {
	const query = new Parse.Query(className);
	query.equalTo("seedKey", seedKey);
	return query.first({ useMasterKey: true });
}

async function fetchAll(query) {
	const results = [];
	const pageSize = 1000;
	let skip = 0;
	let page = [];

	do {
		query.limit(pageSize);
		query.skip(skip);
		page = await query.find({ useMasterKey: true });
		results.push(...page);
		skip += page.length;
	} while (page.length === pageSize);

	return results;
}

function markAsSeedData(object) {
	object.set(IS_SEED_DATA_FIELD, true);
	return object;
}

function surveyPayload(index) {
	return {
		male: index % 2 === 0,
		heightInches: 62 + (index % 9),
		weightCurrent: 138 + (index * 3),
		weightYearAgo: 142 + (index * 3),
		weightNoChange: false,
		weightLossIntentional: index % 3 === 0,
		effort: index % 4,
		getGoing: (index + 1) % 4,
		handPain: index % 5 === 0,
		handSurgery: index % 7 === 0,
		walked: true,
		walkedTimes: 4 + (index % 4),
		walkedMinutes: 20 + ((index % 4) * 10),
		walkedMonths: 10,
		chores: index % 2 === 0,
		choresTimes: 2 + (index % 3),
		choresMinutes: 25 + ((index % 3) * 10),
		choresMonths: 8,
		gardening: index % 3 === 0,
		gardeningTimes: 1 + (index % 2),
		gardeningMinutes: 30 + ((index % 2) * 15),
		gardeningMonths: 5,
		exercise: true,
		exerciseTimes: 3 + (index % 3),
		exerciseMinutes: 25 + ((index % 3) * 5),
		exerciseMonths: 9,
		mowedLawn: index % 4 === 0,
		mowedLawnTimes: 1 + (index % 2),
		mowedLawnMinutes: 35 + ((index % 2) * 10),
		mowedLawnMonths: 4,
		golf: index % 6 === 0,
		golfTimes: 1,
		golfMinutes: 60,
		golfMonths: 2
	};
}

function applySurveyFields(survey, index) {
	const payload = surveyPayload(index);
	Object.keys(payload).forEach((fieldName) => {
		survey.set(fieldName, payload[fieldName]);
	});
}

function buildEnrolleeNumber(index) {
	return String(10000000 + index);
}

async function upsertSurvey(seedKey, currentUser, scope, index, enrollee) {
	const Survey = Parse.Object.extend("Survey");
	let survey = await findBySeedKey("Survey", seedKey);

	if (!survey) {
		survey = new Survey();
		survey.set("seedKey", seedKey);
	}

	markAsSeedData(survey);
	survey.setACL(makeAcl(currentUser));
	survey.set("institution", scope.institution);
	survey.set("specialty", scope.specialty);
	survey.set("seededBy", currentUser);

	applySurveyFields(survey, index);

	if (enrollee) {
		survey.set("enrollee", enrollee);
	} else {
		survey.unset("enrollee");
	}

	return survey.save(null, { useMasterKey: true });
}

async function upsertEnrollee(seedKey, currentUser, scope, index, survey, watchNumber) {
	const Enrollee = Parse.Object.extend("Enrollee");
	let enrollee = await findBySeedKey("Enrollee", seedKey);

	if (!enrollee) {
		enrollee = new Enrollee();
		enrollee.set("seedKey", seedKey);
	}

	markAsSeedData(enrollee);
	enrollee.setACL(makeAcl(currentUser));
	enrollee.set("seededBy", currentUser);
	enrollee.set("institution", scope.institution);
	enrollee.set("specialty", scope.specialty);
	enrollee.set("enrolleeNumber", buildEnrolleeNumber(index));
	enrollee.set("startDate", addDays(new Date(), -(14 + index)));
	enrollee.set("stopDate", addDays(new Date(), 180 + index));
	enrollee.set("gripCompleted", true);
	enrollee.set("gaitCompleted", true);
	enrollee.set("grip", ["28", "30", "29"]);
	enrollee.set("gait", [0.9 + ((index % 3) * 0.1), 1.0 + ((index % 4) * 0.1), 1.1 + ((index % 2) * 0.1)]);
	enrollee.set("enrollmentComplete", Boolean(survey));
	enrollee.set("enrolledInStudy", index <= WATCH_DATA_ENTRY_COUNT);
	if (watchNumber) {
		enrollee.set("watchNumber", watchNumber);
	}

	if (survey) {
		enrollee.set("survey", survey);
	} else {
		enrollee.unset("survey");
	}

	return enrollee.save(null, { useMasterKey: true });
}

async function upsertWatchDevice(seedKey, currentUser, scope, watchNumber, watchIndex) {
	const WatchDevice = Parse.Object.extend("WatchDevice");
	let watchDevice = await findBySeedKey("WatchDevice", seedKey);

	if (!watchDevice) {
		watchDevice = new WatchDevice();
		watchDevice.set("seedKey", seedKey);
	}

	markAsSeedData(watchDevice);
	watchDevice.setACL(makeAcl(currentUser));
	watchDevice.set("watchNumber", String(watchNumber));
	watchDevice.set("deviceUUID", `${seedKey}:uuid:${watchIndex}`);
	watchDevice.set("deviceToken", `${seedKey}:token:${watchIndex}`);
	watchDevice.set("institution", scope.institution);
	watchDevice.set("specialty", scope.specialty);
	watchDevice.set("provisionedBy", currentUser);
	watchDevice.set("seededBy", currentUser);
	watchDevice.set("isActive", true);

	return watchDevice.save(null, { useMasterKey: true });
}

async function upsertActivityRecord(className, seedKey, currentUser, watchDevice, startDate, endDate, fields) {
	const ActivityClass = Parse.Object.extend(className);
	let activity = await findBySeedKey(className, seedKey);

	if (!activity) {
		activity = new ActivityClass();
		activity.set("seedKey", seedKey);
	}

	markAsSeedData(activity);
	activity.setACL(makeAcl(currentUser));
	activity.set("watchDevice", watchDevice);
	activity.set("seededBy", currentUser);
	activity.set("startDate", startDate);
	activity.set("endDate", endDate);

	Object.keys(fields).forEach((fieldName) => {
		activity.set(fieldName, fields[fieldName]);
	});

	return activity.save(null, { useMasterKey: true });
}

async function seedWatchActivity(batchKey, currentUser, scope) {
	const createdWatchNumbers = [];
	const watchDevices = [];
	const baseDate = addDays(new Date(), -14);

	for (let watchIndex = 0; watchIndex < WATCH_COUNT; watchIndex += 1) {
		const watchNumber = WATCH_START_NUMBER + watchIndex;
		const seedKey = makeSeedKey(batchKey, "watchDevice", watchIndex + 1);
		const watchDevice = await upsertWatchDevice(seedKey, currentUser, scope, watchNumber, watchIndex + 1);
		watchDevices.push(watchDevice);
		createdWatchNumbers.push(String(watchNumber));

		for (let dayIndex = 0; dayIndex < 14; dayIndex += 1) {
			const startDate = addDays(baseDate, dayIndex);
			startDate.setUTCHours(6, 0, 0, 0);

			const endDate = addDays(baseDate, dayIndex);
			endDate.setUTCHours(23, 59, 59, 999);

			await upsertActivityRecord(
				"HeartRate",
				makeSeedKey(batchKey, `heartRate-${watchIndex + 1}`, dayIndex + 1),
				currentUser,
				watchDevice,
				startDate,
				endDate,
				{ hrVariability: 34 + watchIndex + dayIndex }
			);

			await upsertActivityRecord(
				"Pedometer",
				makeSeedKey(batchKey, `pedometer-${watchIndex + 1}`, dayIndex + 1),
				currentUser,
				watchDevice,
				startDate,
				endDate,
				{
					distance: 2400 + (watchIndex * 180) + (dayIndex * 55),
					flightsClimbed: 4 + watchIndex + (dayIndex % 3),
					numberOfSteps: 4200 + (watchIndex * 400) + (dayIndex * 120),
					standMinutes: 420 + (dayIndex * 4),
					walkingSpeed: 1 + (watchIndex * 0.05) + ((dayIndex % 4) * 0.03),
					walkingStepLength: 0.62 + (watchIndex * 0.02) + ((dayIndex % 3) * 0.01)
				}
			);

			await upsertActivityRecord(
				"Exercise",
				makeSeedKey(batchKey, `exercise-${watchIndex + 1}`, dayIndex + 1),
				currentUser,
				watchDevice,
				startDate,
				endDate,
				{ exerciseMinutes: 22 + watchIndex + (dayIndex % 5) }
			);
		}
	}

	return createdWatchNumbers;
}

async function seedManagedEntries(batchKey, currentUser, scope) {
	const watchNumbersByEnrollee = Array.from({ length: WATCH_DATA_ENTRY_COUNT }, function(_, index) {
		return String(WATCH_START_NUMBER + (index % WATCH_COUNT));
	});

	let linkedSurveyCount = 0;
	let createdEnrolleeCount = 0;

	for (let index = 1; index <= ENROLLEE_COUNT; index += 1) {
		const watchNumber = index <= WATCH_DATA_ENTRY_COUNT ? watchNumbersByEnrollee[index - 1] : null;
		const linkedSurvey = index <= WATCH_DATA_ENTRY_COUNT
			? await upsertSurvey(makeSeedKey(batchKey, "linkedSurvey", index), currentUser, scope, index, null)
			: null;

		const enrollee = await upsertEnrollee(
			makeSeedKey(batchKey, "enrollee", index),
			currentUser,
			scope,
			index,
			linkedSurvey,
			watchNumber
		);

		if (linkedSurvey) {
			linkedSurvey.set("enrollee", enrollee);
			await linkedSurvey.save(null, { useMasterKey: true });
			linkedSurveyCount += 1;
		}

		createdEnrolleeCount += 1;
	}

	let unenrolledSurveyCount = 0;
	for (let index = 1; index <= UNENROLLED_SURVEY_COUNT; index += 1) {
		await upsertSurvey(makeSeedKey(batchKey, "unenrolledSurvey", index), currentUser, scope, 100 + index, null);
		unenrolledSurveyCount += 1;
	}

	return {
		enrolleeCount: createdEnrolleeCount,
		linkedSurveyCount,
		unenrolledSurveyCount
	};
}

async function loadSeedUserById(userId) {
	if (!userId || typeof userId !== "string" || !userId.trim()) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "A valid userId is required.");
	}

	const query = new Parse.Query(Parse.User);
	return query.get(userId.trim(), { useMasterKey: true });
}

function cleanupScopeFromParams(params, seedUser) {
	const batchKey = typeof params.batchKey === "string" ? params.batchKey.trim() : "";
	const deleteAll = params.deleteAll === true;

	if (seedUser) {
		const userBatchKey = seedUser.get(SEEDED_BATCH_FIELD);
		if (!userBatchKey) {
			throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "The selected user does not have managed seed data.");
		}

		if (batchKey && batchKey !== userBatchKey) {
			throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "The provided batchKey does not match the selected user.");
		}

		return {
			mode: "batch",
			batchKey: userBatchKey
		};
	}

	if (batchKey) {
		return {
			mode: "batch",
			batchKey
		};
	}

	if (deleteAll) {
		return {
			mode: "all"
		};
	}

	throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Provide userId, batchKey, or deleteAll=true to delete managed seed data.");
}

function buildSeedDataQuery(className, scope) {
	const query = new Parse.Query(className);
	query.equalTo(IS_SEED_DATA_FIELD, true);

	if (scope.mode === "batch") {
		query.startsWith("seedKey", `${scope.batchKey}:`);
	}

	return query;
}

async function deleteSeedRowsForClass(className, scope) {
	const query = buildSeedDataQuery(className, scope);
	const objects = await fetchAll(query);
	const count = objects.length;

	if (objects.length) {
		await Parse.Object.destroyAll(objects, { useMasterKey: true });
	}

	return count;
}

async function findSeedUsersForCleanup(scope) {
	const query = new Parse.Query(Parse.User);

	if (scope.mode === "batch") {
		query.equalTo(SEEDED_BATCH_FIELD, scope.batchKey);
		return query.find({ useMasterKey: true });
	}

	query.exists(SEEDED_BATCH_FIELD);
	return fetchAll(query);
}

async function clearSeedFlagsFromUsers(users) {
	if (!users.length) return 0;

	users.forEach((user) => {
		user.unset(SEEDED_BATCH_FIELD);
		user.unset(SEEDED_AT_FIELD);
	});

	await Parse.Object.saveAll(users, { useMasterKey: true });
	return users.length;
}

Parse.Cloud.define("getManagedDataSeedStatus", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to view seed status.");
	}

	const currentUser = await loadCurrentUser(request.user);

	return {
		seeded: Boolean(currentUser.get(SEEDED_AT_FIELD)),
		seededAt: currentUser.get(SEEDED_AT_FIELD) ? currentUser.get(SEEDED_AT_FIELD).toISOString() : null,
		totalManagedEntries: TOTAL_MANAGED_ENTRY_COUNT,
		watchDataEntries: WATCH_DATA_ENTRY_COUNT,
		watchCount: WATCH_COUNT,
		unenrolledSurveyCount: UNENROLLED_SURVEY_COUNT
	};
});

Parse.Cloud.define("seedManagedData", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to seed managed data.");
	}

	const currentUser = await loadCurrentUser(request.user);
	const scope = requireScope(currentUser);

	if (currentUser.get(SEEDED_AT_FIELD)) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Seed data has already been created for this user.");
	}

	const batchKey = currentUser.get(SEEDED_BATCH_FIELD) || seedBatchKeyForUser(currentUser.id);
	const entrySummary = await seedManagedEntries(batchKey, currentUser, scope);
	const watchNumbers = await seedWatchActivity(batchKey, currentUser, scope);
	const seededAt = new Date();

	currentUser.set(SEEDED_BATCH_FIELD, batchKey);
	currentUser.set(SEEDED_AT_FIELD, seededAt);
	await currentUser.save(null, { useMasterKey: true });

	return {
		success: true,
		seededAt: seededAt.toISOString(),
		totalManagedEntries: TOTAL_MANAGED_ENTRY_COUNT,
		enrolleeCount: entrySummary.enrolleeCount,
		linkedSurveyCount: entrySummary.linkedSurveyCount,
		unenrolledSurveyCount: entrySummary.unenrolledSurveyCount,
		watchDataEntries: WATCH_DATA_ENTRY_COUNT,
		watchNumbers
	};
});

Parse.Cloud.define("deleteManagedSeedData", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to delete managed seed data.");
	}

	await requireSuperAdmin(request.user);

	const params = request.params || {};
	const seedUser = params.userId ? await loadSeedUserById(params.userId) : null;
	const scope = cleanupScopeFromParams(params, seedUser);
	const deleted = {};

	for (const className of SEEDED_CLASS_NAMES) {
		deleted[className] = await deleteSeedRowsForClass(className, scope);
	}

	const seedUsers = seedUser ? [seedUser] : await findSeedUsersForCleanup(scope);
	const clearedUsers = await clearSeedFlagsFromUsers(seedUsers);

	return {
		success: true,
		scope: scope.mode === "batch" ? { mode: scope.mode, batchKey: scope.batchKey } : { mode: scope.mode },
		deleted,
		clearedUsers
	};
});
