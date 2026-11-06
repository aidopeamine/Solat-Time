
const prayerNames = [
    { key: "Fajr", fields: ["fajr", "subuh"] },
    { key: "Sunrise", fields: ["syuruk", "sunrise"] },
    { key: "Dhuhr", fields: ["zohor", "dhuhr", "zuhr"] },
    { key: "Asr", fields: ["asar", "asr"] },
    { key: "Maghrib", fields: ["maghrib"] },
    { key: "Isha", fields: ["isyak", "isha"] }
];

let currentTimes = {};
let editingId = null;

const $ = id => document.getElementById(id);


// ------------------------------------
// NAVIGATION
// ------------------------------------

function setStatus(message) {
    $("apiStatus").textContent = message;
}

function showPage(page) {
    const dashboard = page === "dashboard";

    $("dashboardPage").hidden = !dashboard;
    $("remindersPage").hidden = dashboard;

    $("dashboardTab").classList.toggle("active", dashboard);
    $("remindersTab").classList.toggle("active", !dashboard);
}

$("dashboardTab").addEventListener("click", () => showPage("dashboard"));
$("remindersTab").addEventListener("click", () => showPage("reminders"));


// ------------------------------------
// PRAYER TIME FUNCTIONS
// ------------------------------------

function normaliseTime(value) {
    if (typeof value !== "string") return "";

    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (!match) return "";

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour > 23 || minute > 59) return "";

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}


function findPrayerData(json) {
    const candidates = [
        json?.prayerTime,
        json?.data?.prayerTime,
        json?.data,
        json?.data?.data,
        json
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            const today = candidate.find(item =>
                item &&
                typeof item === "object" &&
                (item.fajr || item.subuh)
            );

            if (today) return today;
        }

        if (
            candidate &&
            typeof candidate === "object" &&
            (candidate.fajr || candidate.subuh)
        ) {
            return candidate;
        }
    }

    return null;
}


function getField(data, names) {
    for (const name of names) {
        if (data[name] != null) {
            const value = normaliseTime(String(data[name]));

            if (value) return value;
        }
    }

    return "";
}


// ------------------------------------
// CALCULATE REMAINING TIME
// ------------------------------------

function minutesFromNow(time) {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;

    const [hour, minute] = time.split(":").map(Number);

    if (hour > 23 || minute > 59) return null;

    const now = new Date();
    const target = new Date(now);

    target.setHours(hour, minute, 0, 0);

    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }

    return Math.ceil(
        (target.getTime() - now.getTime()) / 60000
    );
}


// ------------------------------------
// GET TODAY'S DATE
// ------------------------------------

function getTodayString() {
    const today = new Date();

    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}


// ------------------------------------
// FIND UPCOMING ACTIVITY
// ------------------------------------

function getUpcomingActivity() {
    const todayString = getTodayString();

    const activities = getReminders()
        .filter(item =>
            item.type === "activity" &&
            item.date &&
            item.date >= todayString
        )
        .sort((a, b) => a.date.localeCompare(b.date));

    return activities[0] || null;
}


// ------------------------------------
// FIND UPCOMING EVENT
// ------------------------------------

function getUpcomingEvent() {
    const todayString = getTodayString();

    const events = getReminders()
        .filter(item =>
            item.type === "event" &&
            item.date &&
            item.date >= todayString
        )
        .sort((a, b) => a.date.localeCompare(b.date));

    return events[0] || null;
}


// ------------------------------------
// DISPLAY UPCOMING DASHBOARD REMINDERS
// ------------------------------------

function renderDashboardReminders() {
    const event = getUpcomingEvent();
    const activity = getUpcomingActivity();

    if (event) {
        $("dashboardEvent").textContent = event.title;

        $("dashboardEventDate").textContent =
            `Date: ${new Date(event.date + "T00:00:00").toLocaleDateString()}`;
    } else {
        $("dashboardEvent").textContent =
            "No upcoming Islamic event.";

        $("dashboardEventDate").textContent =
            "Add an event in the planner.";
    }

    if (activity) {
        $("dashboardActivity").textContent = activity.title;

        $("dashboardActivityDate").textContent =
            `Date: ${new Date(activity.date + "T00:00:00").toLocaleDateString()}`;
    } else {
        $("dashboardActivity").textContent =
            "No upcoming personal activity.";

        $("dashboardActivityDate").textContent =
            "Add an activity in the planner.";
    }
}


// ------------------------------------
// NEXT PRAYER AND ACTIVITY SUGGESTION
// ------------------------------------

function updateNextPrayer() {
    const prayers = prayerNames.filter(p =>
        p.key !== "Sunrise" && currentTimes[p.key]
    );

    if (!prayers.length) return;

    const upcoming = prayers
        .map(p => ({
            name: p.key,
            time: currentTimes[p.key],
            minutes: minutesFromNow(currentTimes[p.key])
        }))
        .filter(p => p.minutes !== null)
        .sort((a, b) => a.minutes - b.minutes)[0];

    if (!upcoming) {
        $("nextPrayer").textContent =
            "Unable to calculate the next prayer.";

        $("activitySuggestion").textContent =
            "Please check the retrieved prayer times.";

        return;
    }

    const hours = Math.floor(upcoming.minutes / 60);
    const mins = upcoming.minutes % 60;

    $("nextPrayer").textContent =
        `${upcoming.name} at ${upcoming.time} — ` +
        `${hours} hour(s) ${mins} minute(s) remaining.`;

    let suggestion;

    const upcomingActivity = getUpcomingActivity();

    if (upcomingActivity) {
        const activityDate = new Date(
            upcomingActivity.date + "T00:00:00"
        ).toLocaleDateString();

        suggestion =
            `Your upcoming activity: ${upcomingActivity.title} (${activityDate}).`;

    } else if (upcoming.minutes <= 30) {
        suggestion = `Prepare for ${upcoming.name} prayer.`;

    } else if (upcoming.minutes <= 120) {
        suggestion = "Use this time for study or another useful activity.";

    } else {
        suggestion = "Plan your activities around the upcoming prayer.";
    }

    $("activitySuggestion").textContent = suggestion;

    localStorage.setItem("solatSuggestion", JSON.stringify({
        prayer: upcoming.name,
        suggestion: suggestion,
        generatedAt: new Date().toISOString()
    }));
}


// ------------------------------------
// LOAD PRAYER TIMES FROM API
// ------------------------------------

async function loadPrayerTimes() {
    const zone = $("locationSelect").value;

    setStatus("Loading prayer times...");
    $("loadPrayerTimes").disabled = true;

    try {
        const response = await fetch(
            `https://solat.my/api/daily/${encodeURIComponent(zone)}`
        );

        if (!response.ok) {
            throw new Error(`API returned HTTP ${response.status}`);
        }

        const json = await response.json();
        const data = findPrayerData(json);

        if (!data) {
            console.log("API response:", json);

            throw new Error(
                "The response format was not recognised."
            );
        }

        const newTimes = {};

        for (const prayer of prayerNames) {
            newTimes[prayer.key] =
                getField(data, prayer.fields);
        }

        const missing = prayerNames.filter(p =>
            !newTimes[p.key]
        );

        if (missing.length) {
            console.log("API response:", json);

            throw new Error(
                "Missing prayer times: " +
                missing.map(p => p.key).join(", ")
            );
        }

        currentTimes = newTimes;

        for (const prayer of prayerNames) {
            $(prayer.key).textContent =
                currentTimes[prayer.key];
        }

        $("prayerDate").textContent =
            `Zone ${zone} · ${new Date().toLocaleDateString()}`;

        updateNextPrayer();

        setStatus(
            "Prayer times loaded successfully from the API."
        );

    } catch (error) {
        console.error("Prayer API error:", error);

        let message = "Unable to load prayer times.";

        if (!navigator.onLine) {
            message =
                "No internet connection. Please check your connection.";

        } else if (error instanceof TypeError) {
            message =
                "Could not connect to the prayer-time API. Please try again.";

        } else if (error.message.includes("HTTP")) {
            message =
                "The prayer-time service returned an error. Please try again later.";

        } else if (error.message.includes("Missing prayer times")) {
            message =
                "Some prayer times are missing from the API response.";

        } else if (error.message.includes("response format")) {
            message =
                "The API returned unexpected data. Please try again later.";
        }

        setStatus(message);

        $("prayerDate").textContent =
            "Prayer-time data unavailable.";

        $("nextPrayer").textContent =
            "Next prayer cannot be calculated.";

        $("activitySuggestion").textContent =
            "Load valid prayer times before generating a suggestion.";

        for (const prayer of prayerNames) {
            $(prayer.key).textContent = "--:--";
        }

        currentTimes = {};

    } finally {
        $("loadPrayerTimes").disabled = false;
    }
}


$("loadPrayerTimes").addEventListener(
    "click",
    loadPrayerTimes
);


// ------------------------------------
// CRUD: LOCAL STORAGE
// ------------------------------------

function getReminders() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("solatReminders") || "[]"
        );

        return Array.isArray(saved) ? saved : [];

    } catch {
        return [];
    }
}


function saveReminders(reminders) {
    localStorage.setItem(
        "solatReminders",
        JSON.stringify(reminders)
    );
}


// ------------------------------------
// DISPLAY SAVED EVENTS AND ACTIVITIES
// ------------------------------------

function renderReminders() {
    const reminders = getReminders();
    const list = $("reminderList");

    list.replaceChildren();

    $("emptyReminders").hidden =
        reminders.length > 0;

    for (const reminder of reminders) {
        const li = document.createElement("li");

        const label = document.createElement("strong");

        const typeName = reminder.type === "event"
            ? "Islamic Event"
            : "Personal Activity";

        label.textContent =
            `${reminder.title} (${typeName})`;

        const details = document.createElement("span");

        details.className = "reminder-details";

        const dateText = reminder.date
            ? `Date: ${new Date(reminder.date + "T00:00:00").toLocaleDateString()}`
            : "Date not set";

        details.textContent =
            `${dateText}${reminder.description ? " · " + reminder.description : ""}`;

        // EDIT BUTTON

        const edit = document.createElement("button");

        edit.textContent = "Edit";
        edit.className = "edit";

        edit.addEventListener("click", () => {
            editingId = reminder.id;

            $("reminderType").value =
                reminder.type || "activity";

            $("reminderTitle").value =
                reminder.title || "";

            $("reminderDate").value =
                reminder.date || "";

            $("reminderDescription").value =
                reminder.description || "";

            $("formHeading").textContent =
                "Edit event or activity";

            $("saveReminder").textContent =
                "Save Changes";

            $("cancelEdit").hidden = false;

            $("reminderTitle").focus();
        });

        // DELETE BUTTON

        const del = document.createElement("button");

        del.textContent = "Delete";
        del.className = "delete";

        del.addEventListener("click", () => {
            saveReminders(
                getReminders().filter(r =>
                    r.id !== reminder.id
                )
            );

            if (editingId === reminder.id) {
                resetForm();
            }

            renderReminders();
            renderDashboardReminders();

            if (Object.keys(currentTimes).length > 0) {
                updateNextPrayer();
            }

            $("reminderStatus").textContent =
                "Event or activity deleted.";
        });

        li.append(label, details, edit, del);

        list.appendChild(li);
    }
}


// ------------------------------------
// RESET FORM
// ------------------------------------

function resetForm() {
    editingId = null;

    $("reminderForm").reset();

    $("formHeading").textContent =
        "Add an event or activity";

    $("saveReminder").textContent =
        "Add to Planner";

    $("cancelEdit").hidden = true;
}


// ------------------------------------
// CREATE AND UPDATE EVENTS / ACTIVITIES
// ------------------------------------

$("reminderForm").addEventListener(
    "submit",
    event => {
        event.preventDefault();

        const type = $("reminderType").value;
        const title = $("reminderTitle").value.trim();
        const date = $("reminderDate").value;

        const description =
            $("reminderDescription").value.trim();

        // VALIDATION

        if (!type || !title || !date) {
            $("reminderStatus").textContent =
                "Please complete the type, name and date fields.";

            return;
        }

        const reminders = getReminders();

        // UPDATE EXISTING RECORD

        if (editingId !== null) {
            const index = reminders.findIndex(r =>
                r.id === editingId
            );

            if (index !== -1) {
                reminders[index] = {
                    ...reminders[index],
                    type,
                    title,
                    date,
                    description
                };
            }

            $("reminderStatus").textContent =
                "Event or activity updated.";

        } else {
            // CREATE NEW RECORD

            reminders.push({
                id: Date.now(),
                type,
                title,
                date,
                description
            });

            $("reminderStatus").textContent =
                "Event or activity added successfully.";
        }

        // SAVE CHANGES

        saveReminders(reminders);

        resetForm();

        renderReminders();
        renderDashboardReminders();

        if (Object.keys(currentTimes).length > 0) {
            updateNextPrayer();
        }
    }
);


// ------------------------------------
// CANCEL EDITING
// ------------------------------------

$("cancelEdit").addEventListener(
    "click",
    resetForm
);


// ------------------------------------
// INITIALISE APPLICATION
// ------------------------------------

renderReminders();
renderDashboardReminders();


// Refresh prayer calculation every minute.

setInterval(() => {
    if (Object.keys(currentTimes).length > 0) {
        updateNextPrayer();
    }

    renderDashboardReminders();

}, 60 * 1000);
