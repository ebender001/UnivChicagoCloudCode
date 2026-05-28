const { exportScopeForRole } = require("./roleAccess.js");

const surveyDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC"
});

const csvColumns = [
	{ header: "Enrollee ID", key: "enrolleeId" },
	{ header: "Survey Date", key: "surveyDate" },
	{ header: "Frailty Assessment", key: "frailtyAssessment" },
	{ header: "Frailty Score", key: "frailtyScore" },
	{ header: "Weight Loss Score", key: "weightLossScore" },
	{ header: "Current Weight", key: "currentWeight" },
	{ header: "Weight 1 Year Ago", key: "pastWeight" },
	{ header: "BMI", key: "bmi" },
	{ header: "Intentional Weight Loss", key: "intentionalWeightLoss" },
	{ header: "Exhaustion Score", key: "exhaustionScore" },
	{ header: "Everything You Did Was An Effort", key: "effort" },
	{ header: "Could Not Get Going", key: "getGoing" },
	{ header: "Activity Score", key: "activityScore" },
	{ header: "Kcals Expended Per Week", key: "activityKcalsPerWeek" },
	{ header: "Walked Last 2 Weeks", key: "walkedSummary" },
	{ header: "Strenuous Chores", key: "choresSummary" },
	{ header: "Gardening", key: "gardeningSummary" },
	{ header: "Exercise", key: "exerciseSummary" },
	{ header: "Mowed Lawn", key: "mowedLawnSummary" },
	{ header: "Golf", key: "golfSummary" },
	{ header: "Handgrip Score", key: "handgripScore" },
	{ header: "Hand Grip Test Completed", key: "gripCompleted" },
	{ header: "Maximum Hand Grip Score", key: "maxGrip" },
	{ header: "Recorded Hand Grip Values", key: "gripValues" },
	{ header: "Gait Speed Score", key: "gaitSpeedScore" },
	{ header: "Gait Test Completed", key: "gaitCompleted" },
	{ header: "Fastest Walking Speed", key: "fastestGait" },
	{ header: "Recorded Gait Speed Values", key: "gaitValues" }
];

const effortAnswers = [
	"None of the time",
	"Some or a little of the time (1-2 days)",
	"A moderate amount of the time (3-4 days)",
	"Most of the time (>4 days)"
];

function isPresent(value) {
	return value !== null && value !== undefined && value !== "";
}

function toNumber(value) {
	if (!isPresent(value)) return null;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
	if (!Number.isFinite(value)) return "";
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function maxNumber(values) {
	if (!Array.isArray(values)) return null;
	const numbers = values.map(toNumber).filter((value) => Number.isFinite(value));
	if (!numbers.length) return null;
	return Math.max(...numbers);
}

function booleanToAnswer(value) {
	if (value === true) return "Yes";
	if (value === false) return "No";
	return "";
}

function effortAnswer(value) {
	const numericValue = toNumber(value);
	if (Number.isFinite(numericValue) && effortAnswers[numericValue]) return effortAnswers[numericValue];
	if (typeof value === "string" && effortAnswers.includes(value)) return value;
	return "";
}

function assessmentForScore(score) {
	if (score === 0) return "Not frail";
	if (score === 1 || score === 2) return "Pre-Frail";
	return "Frail";
}

function formatSurveyDate(value) {
	if (!(value instanceof Date)) return "";
	return surveyDateFormatter.format(value);
}

function formatValue(value) {
	if (!isPresent(value)) return "";
	if (typeof value === "boolean") return value ? "True" : "False";
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

function csvEscape(value) {
	const text = formatValue(value);
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

function bmiFromSurvey(survey) {
	const currentWeight = toNumber(survey.get("weightCurrent"));
	const heightInches = toNumber(survey.get("heightInches"));
	if (!Number.isFinite(currentWeight) || !Number.isFinite(heightInches) || heightInches <= 0) return null;
	return (703 * currentWeight) / Math.pow(heightInches, 2);
}

function calculateWeightLossScore(survey, bmi) {
	const currentWeight = toNumber(survey.get("weightCurrent"));
	const pastWeight = survey.get("weightNoChange") === true ? currentWeight : toNumber(survey.get("weightYearAgo"));
	const weightLoss = Number.isFinite(pastWeight) && Number.isFinite(currentWeight) ? pastWeight - currentWeight : 0;
	const weightPercent = Number.isFinite(pastWeight) && pastWeight > 0 ? (weightLoss / pastWeight) * 100 : 0;
	const unintentionalLoss = survey.get("weightLossIntentional") !== true && (weightLoss > 10 || weightPercent > 5);
	return Number(unintentionalLoss || (Number.isFinite(bmi) && bmi < 18.5));
}

function calculateExhaustionScore(survey) {
	return Number((toNumber(survey.get("effort")) || 0) + (toNumber(survey.get("getGoing")) || 0) > 0);
}

function calculateGaitSpeedScore(enrollee, survey) {
	const male = survey.get("male") === true;
	const heightThreshold = male ? 68 : 63;
	const speedThreshold = toNumber(survey.get("heightInches")) > heightThreshold ? 0.76 : 0.65;
	const fastestGait = maxNumber(enrollee.get("gait"));

	return Number(enrollee.get("gaitCompleted") !== true || !Number.isFinite(fastestGait) || fastestGait <= speedThreshold);
}

function activitySummary(survey, booleanField, timesField, minutesField, monthsField) {
	if (survey.get(booleanField) !== true) return "No";

	return [
		`${toNumber(survey.get(timesField)) || 0} times in 2 weeks`,
		`${toNumber(survey.get(minutesField)) || 0} minutes/session`,
		`${toNumber(survey.get(monthsField)) || 0} months/year`
	].join(", ");
}

function calculateActivitySum(survey) {
	const currentWeight = toNumber(survey.get("weightCurrent"));
	if (!Number.isFinite(currentWeight)) return 0;

	const weightKg = currentWeight / 2.20462;
	const activityWeights = [
		{ booleanField: "walked", timesField: "walkedTimes", minutesField: "walkedMinutes", monthsField: "walkedMonths", weight: 3.5 },
		{ booleanField: "chores", timesField: "choresTimes", minutesField: "choresMinutes", monthsField: "choresMonths", weight: 4.0 },
		{ booleanField: "gardening", timesField: "gardeningTimes", minutesField: "gardeningMinutes", monthsField: "gardeningMonths", weight: 5.0 },
		{ booleanField: "exercise", timesField: "exerciseTimes", minutesField: "exerciseMinutes", monthsField: "exerciseMonths", weight: 4.5 },
		{ booleanField: "mowedLawn", timesField: "mowedLawnTimes", minutesField: "mowedLawnMinutes", monthsField: "mowedLawnMonths", weight: 4.5 },
		{ booleanField: "golf", timesField: "golfTimes", minutesField: "golfMinutes", monthsField: "golfMonths", weight: 4.5 }
	];

	return activityWeights.reduce((total, activity) => {
		if (survey.get(activity.booleanField) !== true) return total;

		return total +
			((toNumber(survey.get(activity.timesField)) || 0) / 2) *
			((toNumber(survey.get(activity.minutesField)) || 0) / 60) *
			((toNumber(survey.get(activity.monthsField)) || 0) / 12) *
			weightKg *
			activity.weight;
	}, 0);
}

function calculateActivityScore(survey, activitySum) {
	const threshold = survey.get("male") === true ? 148 : 105;
	return Number(activitySum < threshold);
}

function calculateGripScore(enrollee, survey, bmi) {
	const maxGrip = maxNumber(enrollee.get("grip"));
	if (enrollee.get("gripCompleted") !== true || !Number.isFinite(maxGrip) || !Number.isFinite(bmi)) return 1;

	if (survey.get("male") === true) {
		if (bmi <= 24) return Number(maxGrip <= 29);
		if (bmi > 28) return Number(maxGrip <= 32);
		return Number(maxGrip <= 30);
	}

	if (bmi <= 23) return Number(maxGrip <= 17);
	if (bmi > 29) return Number(maxGrip <= 21);
	if (bmi > 23 && bmi <= 26) return Number(maxGrip <= 17.3);
	return Number(maxGrip <= 18);
}

function calculateFrailty(enrollee, survey) {
	const bmi = bmiFromSurvey(survey);
	const maxGrip = maxNumber(enrollee.get("grip"));
	const fastestGait = maxNumber(enrollee.get("gait"));
	const currentWeight = toNumber(survey.get("weightCurrent"));
	const pastWeight = survey.get("weightNoChange") === true ? currentWeight : toNumber(survey.get("weightYearAgo"));
	const weightLossScore = calculateWeightLossScore(survey, bmi);
	const exhaustionScore = calculateExhaustionScore(survey);
	const gaitSpeedScore = calculateGaitSpeedScore(enrollee, survey);
	const activitySum = calculateActivitySum(survey);
	const activityScore = calculateActivityScore(survey, activitySum);
	const handgripScore = calculateGripScore(enrollee, survey, bmi);
	const frailtyScore = weightLossScore + exhaustionScore + gaitSpeedScore + activityScore + handgripScore;

	return {
		enrolleeId: enrollee.id,
		surveyDate: formatSurveyDate(survey.createdAt),
		frailtyAssessment: assessmentForScore(frailtyScore),
		frailtyScore,
		weightLossScore,
		currentWeight: Number.isFinite(currentWeight) ? `${currentWeight} lbs` : "",
		pastWeight: Number.isFinite(pastWeight) ? `${pastWeight} lbs` : "",
		bmi: Number.isFinite(bmi) ? formatNumber(bmi) : "",
		intentionalWeightLoss: booleanToAnswer(survey.get("weightLossIntentional")) || "No",
		exhaustionScore,
		effort: effortAnswer(survey.get("effort")) || "No answer recorded",
		getGoing: effortAnswer(survey.get("getGoing")) || "No answer recorded",
		activityScore,
		activityKcalsPerWeek: `${activitySum.toFixed(2)} kcal / week`,
		walkedSummary: activitySummary(survey, "walked", "walkedTimes", "walkedMinutes", "walkedMonths"),
		choresSummary: activitySummary(survey, "chores", "choresTimes", "choresMinutes", "choresMonths"),
		gardeningSummary: activitySummary(survey, "gardening", "gardeningTimes", "gardeningMinutes", "gardeningMonths"),
		exerciseSummary: activitySummary(survey, "exercise", "exerciseTimes", "exerciseMinutes", "exerciseMonths"),
		mowedLawnSummary: activitySummary(survey, "mowedLawn", "mowedLawnTimes", "mowedLawnMinutes", "mowedLawnMonths"),
		golfSummary: activitySummary(survey, "golf", "golfTimes", "golfMinutes", "golfMonths"),
		handgripScore,
		gripCompleted: booleanToAnswer(enrollee.get("gripCompleted")) || "No",
		maxGrip: Number.isFinite(maxGrip) ? `${maxGrip} kg` : "No hand grip recorded",
		gripValues: Array.isArray(enrollee.get("grip")) && enrollee.get("grip").length ? `${enrollee.get("grip").join(", ")} kg` : "No hand grip recorded",
		gaitSpeedScore,
		gaitCompleted: booleanToAnswer(enrollee.get("gaitCompleted")) || "No",
		fastestGait: Number.isFinite(fastestGait) ? `${fastestGait.toFixed(2)} m/s` : "No gait speed recorded",
		gaitValues: Array.isArray(enrollee.get("gait")) && enrollee.get("gait").length ? `${enrollee.get("gait").join(", ")} m/s` : "No gait speed recorded"
	};
}

function frailtyJsonRow(row) {
	return {
		enrolleeId: row.enrolleeId,
		surveyDate: row.surveyDate,
		frailtyAssessment: row.frailtyAssessment,
		frailtyScore: row.frailtyScore,
		factors: {
			weightLoss: {
				score: row.weightLossScore,
				currentWeight: row.currentWeight,
				pastWeight: row.pastWeight,
				bmi: row.bmi,
				intentionalWeightLoss: row.intentionalWeightLoss
			},
			exhaustion: {
				score: row.exhaustionScore,
				effort: row.effort,
				couldNotGetGoing: row.getGoing
			},
			activity: {
				score: row.activityScore,
				kcalsExpendedPerWeek: row.activityKcalsPerWeek,
				walkedLast2Weeks: row.walkedSummary,
				strenuousChores: row.choresSummary,
				gardening: row.gardeningSummary,
				exercise: row.exerciseSummary,
				mowedLawn: row.mowedLawnSummary,
				golf: row.golfSummary
			},
			handgrip: {
				score: row.handgripScore,
				testCompleted: row.gripCompleted,
				maximumHandGripScore: row.maxGrip,
				recordedValues: row.gripValues
			},
			gaitSpeed: {
				score: row.gaitSpeedScore,
				testCompleted: row.gaitCompleted,
				fastestWalkingSpeed: row.fastestGait,
				recordedValues: row.gaitValues
			}
		}
	};
}

function serializeCsv(rows) {
	const header = csvColumns.map((column) => csvEscape(column.header)).join(",");
	const body = rows.map((row) => csvColumns.map((column) => csvEscape(row[column.key])).join(","));
	return [header].concat(body).join("\n");
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include("institution");
	return query.get(user.id, { useMasterKey: true });
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

async function findEnrolleesForExport(user) {
	const currentUser = await getCurrentUser(user);
	const exportScope = await exportScopeForRole(currentUser.get("role"));
	const query = new Parse.Query("Enrollee");
	query.include("survey");
	query.exists("survey");
	query.ascending("createdAt");

	if (exportScope === "institution") {
		const institution = currentUser.get("institution");
		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account is not assigned to an institution.");
		}

		query.equalTo("institution", institution);
	}

	return fetchAll(query);
}

Parse.Cloud.define("downloadFrailtyScores", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to download frailty scores.");
	}

	const format = request.params && request.params.format === "json" ? "json" : "csv";
	const enrollees = await findEnrolleesForExport(request.user);
	const rows = enrollees
		.filter((enrollee) => enrollee.get("survey"))
		.map((enrollee) => calculateFrailty(enrollee, enrollee.get("survey")));

	if (format === "json") {
		return {
			filename: "frailty-scores.json",
			contentType: "application/json",
			count: rows.length,
			content: JSON.stringify(rows.map(frailtyJsonRow), null, 2)
		};
	}

	const csv = serializeCsv(rows);
	return {
		filename: "frailty-scores.csv",
		contentType: "text/csv",
		count: rows.length,
		content: csv,
		csv
	};
});
