const combinedColumns = [
	{ header: "Watch Number", key: "watchNumber" },
	{ header: "Heart Rate Start Date", key: "heartRateStartDate" },
	{ header: "Heart Rate End Date", key: "heartRateEndDate" },
	{ header: "HR Variability", key: "hrVariability" },
	{ header: "Pedometer Start Date", key: "pedometerStartDate" },
	{ header: "Pedometer End Date", key: "pedometerEndDate" },
	{ header: "Number of Steps", key: "numberOfSteps" },
	{ header: "Stand Minutes", key: "standMinutes" },
	{ header: "Walking Step Length (meters)", key: "walkingStepLength" },
	{ header: "Walking Speed (m/s)", key: "walkingSpeed" },
	{ header: "Flights Climbed", key: "flightsClimbed" },
	{ header: "Distance (meters)", key: "distance" },
	{ header: "Exercise Start Date", key: "exerciseStartDate" },
	{ header: "Exercise End Date", key: "exerciseEndDate" },
	{ header: "Exercise Minutes", key: "exerciseMinutes" }
];

const heartRateColumns = [
	{ header: "Watch Number", key: "watchNumber" },
	{ header: "Heart Rate Start Date", key: "heartRateStartDate" },
	{ header: "Heart Rate End Date", key: "heartRateEndDate" },
	{ header: "HR Variability", key: "hrVariability" }
];

const pedometerColumns = [
	{ header: "Watch Number", key: "watchNumber" },
	{ header: "Pedometer Start Date", key: "pedometerStartDate" },
	{ header: "Pedometer End Date", key: "pedometerEndDate" },
	{ header: "Number of Steps", key: "numberOfSteps" },
	{ header: "Stand Minutes", key: "standMinutes" },
	{ header: "Walking Step Length (meters)", key: "walkingStepLength" },
	{ header: "Walking Speed (m/s)", key: "walkingSpeed" },
	{ header: "Flights Climbed", key: "flightsClimbed" },
	{ header: "Distance (meters)", key: "distance" }
];

const exerciseColumns = [
	{ header: "Watch Number", key: "watchNumber" },
	{ header: "Exercise Start Date", key: "exerciseStartDate" },
	{ header: "Exercise End Date", key: "exerciseEndDate" },
	{ header: "Exercise Minutes", key: "exerciseMinutes" }
];

const localDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
	timeZone: "America/Chicago"
});

function isPresent(value) {
	return value !== null && value !== undefined && value !== "";
}

function formatLocalDateTime(value) {
	return localDateTimeFormatter.format(value).replace(" at ", " - ");
}

function formatValue(value) {
	if (!isPresent(value)) return "";
	if (value instanceof Date) return formatLocalDateTime(value);
	if (typeof value === "boolean") return value ? "True" : "False";
	return String(value);
}

function csvEscape(value) {
	const text = formatValue(value);
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

function rowKey(watchDevice, startDate, endDate) {
	const start = startDate instanceof Date ? startDate.toISOString() : "";
	const end = endDate instanceof Date ? endDate.toISOString() : "";
	return `${watchDevice.id}:${start}:${end}`;
}

function getOrCreateRow(rowsByKey, watchDevice, startDate, endDate) {
	const key = rowKey(watchDevice, startDate, endDate);

	if (!rowsByKey.has(key)) {
		rowsByKey.set(key, {
			sortDate: startDate instanceof Date ? startDate : new Date(0),
			watchNumber: watchDevice.get("watchNumber") || ""
		});
	}

	return rowsByKey.get(key);
}

function serializeCsv(columns, rows) {
	const header = columns.map((column) => csvEscape(column.header)).join(",");
	const body = rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(","));
	return [header].concat(body).join("\n");
}

function serializeJson(columns, rows) {
	return JSON.stringify(rows.map((row) => {
		const item = {};
		columns.forEach((column) => {
			item[column.header] = formatValue(row[column.key]);
		});
		return item;
	}), null, 2);
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include("institution");
	return query.get(user.id, { useMasterKey: true });
}

function scopedWatchDeviceQuery(currentUser) {
	const query = new Parse.Query("WatchDevice");
	query.ascending("watchNumber");
	query.limit(1000);

	if (currentUser.get("role") !== "super_admin") {
		const institution = currentUser.get("institution");
		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account is not assigned to an institution.");
		}

		query.equalTo("institution", institution);
	}

	return query;
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

async function fetchActivityObjects(user) {
	const currentUser = await getCurrentUser(user);
	const watchDeviceQuery = scopedWatchDeviceQuery(currentUser);

	function buildQuery(className) {
		const query = new Parse.Query(className);
		query.include("watchDevice");
		query.matchesQuery("watchDevice", watchDeviceQuery);
		query.ascending("startDate");
		return query;
	}

	const [heartRates, pedometers, exercises] = await Promise.all([
		fetchAll(buildQuery("HeartRate")),
		fetchAll(buildQuery("Pedometer")),
		fetchAll(buildQuery("Exercise"))
	]);

	return { heartRates, pedometers, exercises };
}

function sortRows(rows) {
	return rows.sort((left, right) => {
		if (left.watchNumber !== right.watchNumber) return left.watchNumber.localeCompare(right.watchNumber);
		return left.sortDate - right.sortDate;
	});
}

function heartRateRows(heartRates) {
	return sortRows(heartRates.map((heartRate) => {
		const watchDevice = heartRate.get("watchDevice");
		return {
			sortDate: heartRate.get("startDate") instanceof Date ? heartRate.get("startDate") : new Date(0),
			watchNumber: watchDevice ? watchDevice.get("watchNumber") || "" : "",
			heartRateStartDate: heartRate.get("startDate"),
			heartRateEndDate: heartRate.get("endDate"),
			hrVariability: heartRate.get("hrVariability")
		};
	}));
}

function pedometerRows(pedometers) {
	return sortRows(pedometers.map((pedometer) => {
		const watchDevice = pedometer.get("watchDevice");
		return {
			sortDate: pedometer.get("startDate") instanceof Date ? pedometer.get("startDate") : new Date(0),
			watchNumber: watchDevice ? watchDevice.get("watchNumber") || "" : "",
			pedometerStartDate: pedometer.get("startDate"),
			pedometerEndDate: pedometer.get("endDate"),
			numberOfSteps: pedometer.get("numberOfSteps"),
			standMinutes: pedometer.get("standMinutes"),
			walkingStepLength: pedometer.get("walkingStepLength"),
			walkingSpeed: pedometer.get("walkingSpeed"),
			flightsClimbed: pedometer.get("flightsClimbed"),
			distance: pedometer.get("distance")
		};
	}));
}

function exerciseRows(exercises) {
	return sortRows(exercises.map((exercise) => {
		const watchDevice = exercise.get("watchDevice");
		return {
			sortDate: exercise.get("startDate") instanceof Date ? exercise.get("startDate") : new Date(0),
			watchNumber: watchDevice ? watchDevice.get("watchNumber") || "" : "",
			exerciseStartDate: exercise.get("startDate"),
			exerciseEndDate: exercise.get("endDate"),
			exerciseMinutes: exercise.get("exerciseMinutes")
		};
	}));
}

function combinedRows(activityObjects) {
	const rowsByKey = new Map();

	activityObjects.heartRates.forEach((heartRate) => {
		const watchDevice = heartRate.get("watchDevice");
		const row = getOrCreateRow(rowsByKey, watchDevice, heartRate.get("startDate"), heartRate.get("endDate"));
		row.heartRateStartDate = heartRate.get("startDate");
		row.heartRateEndDate = heartRate.get("endDate");
		row.hrVariability = heartRate.get("hrVariability");
	});

	activityObjects.pedometers.forEach((pedometer) => {
		const watchDevice = pedometer.get("watchDevice");
		const row = getOrCreateRow(rowsByKey, watchDevice, pedometer.get("startDate"), pedometer.get("endDate"));
		row.pedometerStartDate = pedometer.get("startDate");
		row.pedometerEndDate = pedometer.get("endDate");
		row.numberOfSteps = pedometer.get("numberOfSteps");
		row.standMinutes = pedometer.get("standMinutes");
		row.walkingStepLength = pedometer.get("walkingStepLength");
		row.walkingSpeed = pedometer.get("walkingSpeed");
		row.flightsClimbed = pedometer.get("flightsClimbed");
		row.distance = pedometer.get("distance");
	});

	activityObjects.exercises.forEach((exercise) => {
		const watchDevice = exercise.get("watchDevice");
		const row = getOrCreateRow(rowsByKey, watchDevice, exercise.get("startDate"), exercise.get("endDate"));
		row.exerciseStartDate = exercise.get("startDate");
		row.exerciseEndDate = exercise.get("endDate");
		row.exerciseMinutes = exercise.get("exerciseMinutes");
	});

	return sortRows(Array.from(rowsByKey.values()));
}

function buildFile(filenameBase, columns, rows, format) {
	const isJson = format === "json";
	const content = isJson ? serializeJson(columns, rows) : serializeCsv(columns, rows);

	return {
		filename: `${filenameBase}.${isJson ? "json" : "csv"}`,
		contentType: isJson ? "application/json" : "text/csv",
		count: rows.length,
		content,
		csv: content
	};
}

function buildExport(activityObjects, exportType, format) {
	if (exportType === "heartRate") {
		return buildFile("heart-rate-data", heartRateColumns, heartRateRows(activityObjects.heartRates), format);
	}

	if (exportType === "pedometer") {
		return buildFile("pedometer-data", pedometerColumns, pedometerRows(activityObjects.pedometers), format);
	}

	if (exportType === "exercise") {
		return buildFile("exercise-data", exerciseColumns, exerciseRows(activityObjects.exercises), format);
	}

	if (exportType === "separate") {
		return {
			filename: "activity-data-files.zip",
			contentType: "application/zip",
			files: [
				buildFile("heart-rate-data", heartRateColumns, heartRateRows(activityObjects.heartRates), format),
				buildFile("pedometer-data", pedometerColumns, pedometerRows(activityObjects.pedometers), format),
				buildFile("exercise-data", exerciseColumns, exerciseRows(activityObjects.exercises), format)
			]
		};
	}

	return buildFile("activity-data", combinedColumns, combinedRows(activityObjects), format);
}

Parse.Cloud.define("downloadActivityData", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to download activity data.");
	}

	const exportType = request.params && request.params.exportType ? request.params.exportType : "combined";
	const validTypes = ["combined", "heartRate", "pedometer", "exercise", "separate"];
	if (!validTypes.includes(exportType)) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Invalid activity export type.");
	}

	const format = request.params && request.params.format === "json" ? "json" : "csv";
	const activityObjects = await fetchActivityObjects(request.user);
	return buildExport(activityObjects, exportType, format);
});
