const effortScoreByAnswer = {
	"None of the time": 0,
	"Some or a little of the time (1-2 days)": 1,
	"A moderate amount of the time (3-4 days)": 2,
	"Most of the time (>4 days)": 3
};

function isPresent(value) {
	return value !== undefined && value !== null && value !== "";
}

function firstPresent() {
	for (let index = 0; index < arguments.length; index += 1) {
		if (isPresent(arguments[index])) return arguments[index];
	}

	return null;
}

function toBoolean(value) {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return null;

	const normalized = value.trim().toLowerCase();
	if (["yes", "true", "1"].includes(normalized)) return true;
	if (["no", "false", "0"].includes(normalized)) return false;
	return null;
}

function toNumber(value) {
	if (!isPresent(value)) return null;

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	return parsed;
}

function toEffortScore(value) {
	if (!isPresent(value)) return null;
	if (Object.prototype.hasOwnProperty.call(effortScoreByAnswer, value)) {
		return effortScoreByAnswer[value];
	}

	return toNumber(value);
}

function setIfPresent(object, field, value) {
	if (value !== null && value !== undefined) {
		object.set(field, value);
	}
}

function setActivityFields(survey, payload, config) {
	const completed = toBoolean(payload[config.sourceBoolean]);
	setIfPresent(survey, config.targetBoolean, completed);

	if (!completed) return;

	// Follow-up activity details are stored only when the patient answered Yes.
	setIfPresent(survey, config.targetTimes, toNumber(payload[config.sourceTimes]));
	setIfPresent(survey, config.targetMinutes, toNumber(payload[config.sourceMinutes]));
	setIfPresent(survey, config.targetMonths, toNumber(payload[config.sourceMonths]));
}

Parse.Cloud.define("saveSurveyResults", async (request) => {
	const payload = request.params && (request.params.survey || request.params);
	if (!payload || typeof payload !== "object") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Survey payload is required.");
	}

	const Survey = Parse.Object.extend("Survey");
	const survey = new Survey();

	const heightFeet = toNumber(payload.heightFeet);
	const heightInches = toNumber(payload.heightInches);
	const totalHeightInches = heightFeet !== null && heightInches !== null
		? (heightFeet * 12) + heightInches
		: heightInches;

	setIfPresent(survey, "male", payload.gender === "Male" ? true : payload.gender === "Female" ? false : toBoolean(payload.male));
	setIfPresent(survey, "heightInches", totalHeightInches);
	setIfPresent(survey, "weightCurrent", toNumber(firstPresent(payload.currentWeight, payload.weightCurrent)));
	setIfPresent(survey, "weightYearAgo", toNumber(firstPresent(payload.previousWeightOneYearAgo, payload.weightYearAgo)));
	setIfPresent(survey, "weightNoChange", toBoolean(firstPresent(payload.noWeightChange, payload.weightNoChange)));
	setIfPresent(survey, "weightLossIntentional", toBoolean(firstPresent(payload.intentionalWeightLoss, payload.weightLossIntentional)));
	setIfPresent(survey, "effort", toEffortScore(firstPresent(payload.everythingWasEffort, payload.effort)));
	setIfPresent(survey, "getGoing", toEffortScore(firstPresent(payload.couldNotGetGoing, payload.getGoing)));
	setIfPresent(survey, "handPain", toBoolean(firstPresent(payload.dominantWristHandPain, payload.handPain)));
	setIfPresent(survey, "handSurgery", toBoolean(firstPresent(payload.dominantHandArmSurgeryLastThreeMonths, payload.handSurgery)));

	setActivityFields(survey, payload, {
		sourceBoolean: "walkedForExercise",
		sourceTimes: "walkingTimesTwoWeeks",
		sourceMinutes: "walkingMinutesPerSession",
		sourceMonths: "walkingMonthsPerYear",
		targetBoolean: "walked",
		targetTimes: "walkedTimes",
		targetMinutes: "walkedMinutes",
		targetMonths: "walkedMonths"
	});

	setActivityFields(survey, payload, {
		sourceBoolean: "moderatelyStrenuousChores",
		sourceTimes: "choresTimesTwoWeeks",
		sourceMinutes: "choresMinutesPerSession",
		sourceMonths: "choresMonthsPerYear",
		targetBoolean: "chores",
		targetTimes: "choresTimes",
		targetMinutes: "choresMinutes",
		targetMonths: "choresMonths"
	});

	setActivityFields(survey, payload, {
		sourceBoolean: "gardening",
		sourceTimes: "gardeningTimesTwoWeeks",
		sourceMinutes: "gardeningMinutesPerSession",
		sourceMonths: "gardeningMonthsPerYear",
		targetBoolean: "gardening",
		targetTimes: "gardeningTimes",
		targetMinutes: "gardeningMinutes",
		targetMonths: "gardeningMonths"
	});

	setActivityFields(survey, payload, {
		sourceBoolean: "generalExercise",
		sourceTimes: "generalExerciseTimesTwoWeeks",
		sourceMinutes: "generalExerciseMinutesPerSession",
		sourceMonths: "generalExerciseMonthsPerYear",
		targetBoolean: "exercise",
		targetTimes: "exerciseTimes",
		targetMinutes: "exerciseMinutes",
		targetMonths: "exerciseMonths"
	});

	setActivityFields(survey, payload, {
		sourceBoolean: "lawnMowing",
		sourceTimes: "lawnMowingTimesTwoWeeks",
		sourceMinutes: "lawnMowingMinutesPerSession",
		sourceMonths: "lawnMowingMonthsPerYear",
		targetBoolean: "mowedLawn",
		targetTimes: "mowedLawnTimes",
		targetMinutes: "mowedLawnMinutes",
		targetMonths: "mowedLawnMonths"
	});

	setActivityFields(survey, payload, {
		sourceBoolean: "golfing",
		sourceTimes: "golfingTimesTwoWeeks",
		sourceMinutes: "golfingMinutesPerSession",
		sourceMonths: "golfingMonthsPerYear",
		targetBoolean: "golf",
		targetTimes: "golfTimes",
		targetMinutes: "golfMinutes",
		targetMonths: "golfMonths"
	});

	let enrollee = null;
	const enrolleeId = payload.enrolleeId || payload.enrolleeObjectId || payload.enrollee;
	if (request.user && typeof enrolleeId === "string" && enrolleeId.trim()) {
		enrollee = Parse.Object.extend("Enrollee").createWithoutData(enrolleeId.trim());
		survey.set("enrollee", enrollee);
	}

	const acl = request.user ? new Parse.ACL(request.user) : new Parse.ACL();
	acl.setPublicReadAccess(false);
	acl.setPublicWriteAccess(false);
	survey.setACL(acl);

	const savedSurvey = await survey.save(null, { useMasterKey: true });

	if (enrollee) {
		// Keep Survey.enrollee and Enrollee.survey in sync for either start-from-survey flow.
		enrollee.set("survey", savedSurvey);
		enrollee.set("enrollmentComplete", true);
		await enrollee.save(null, { useMasterKey: true });
	}

	return {
		objectId: savedSurvey.id,
		createdAt: savedSurvey.createdAt
	};
});
