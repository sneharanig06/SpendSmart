
/* =====================================================
   SPENDSMART - COMPLETE FRONTEND JAVASCRIPT
   Month-wise tracking + FastAPI backend
===================================================== */

const API_BASE_URL = "https://spendsmart-backend-5tdd.onrender.com";
let token = localStorage.getItem("spendsmart_token");
let currentUser = JSON.parse(
    localStorage.getItem("spendsmart_user") || "null"
);

let allExpenses = [];
let expenses = [];

let categoryChart = null;
let monthlyChart = null;
let analyticsCategoryChart = null;
let analyticsMonthlyChart = null;

let editingExpenseId = null;

const $ = (id) => document.getElementById(id);

const pageNames = [
    "dashboard",
    "budget",
    "transactions",
    "analytics",
    "notifications",
    "settings"
];

const trackingMonthInput = $("trackingMonth");

/* -------------------- HELPERS -------------------- */

function showMessage(id, message, success = false) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#21a67a" : "#e45d72";
}

function formatMoney(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function getToday() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
    const now = new Date();

    return {
        month: now.getMonth() + 1,
        year: now.getFullYear()
    };
}

function getSelectedTrackingMonth() {
    if (!trackingMonthInput || !trackingMonthInput.value) {
        return getCurrentMonth();
    }

    const [year, month] = trackingMonthInput.value
        .split("-")
        .map(Number);

    return { month, year };
}

function setSelectedTrackingMonth(month, year) {
    if (!trackingMonthInput) return;

    trackingMonthInput.value =
        `${year}-${String(month).padStart(2, "0")}`;
}

function getSelectedMonthString() {
    const { month, year } = getSelectedTrackingMonth();

    return `${year}-${String(month).padStart(2, "0")}`;
}

function setVisible(id, visible) {
    const element = $(id);
    if (!element) return;

    element.hidden = !visible;
    element.style.display = visible ? "" : "none";
}

function showAuthView() {
    setVisible("authView", true);
    setVisible("appView", false);
}

function showAppView() {
    setVisible("authView", false);
    setVisible("appView", true);
}

function setButtonLoading(button, loading, originalText) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading ? "Please wait..." : originalText;
}

function getMonthName(month) {
    return new Date(2000, month - 1, 1).toLocaleString(
        "en-IN",
        { month: "long" }
    );
}

/* -------------------- API REQUEST -------------------- */

async function apiRequest(endpoint, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    if (
        options.body !== undefined &&
        !(options.body instanceof FormData)
    ) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Cannot connect to the backend. Make sure FastAPI is running."
        );
    }

    if (!response.ok) {
        let message = response.statusText || "Request failed.";

        try {
            const data = await response.json();
            message = data.detail || data.message || message;
        } catch {
            // Use default error message.
        }

        const error = new Error(message);
        error.status = response.status;

        throw error;
    }

    if (response.status === 204) return null;

    const responseText = await response.text();

    return responseText ? JSON.parse(responseText) : null;
}

/* -------------------- AUTHENTICATION -------------------- */

async function handleLogin(event) {
    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const button = $("loginForm").querySelector(
        'button[type="submit"]'
    );

    try {
        showMessage("authMessage", "Logging in...");
        setButtonLoading(button, true, "Login");

        const data = await apiRequest("/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        if (!data.access_token) {
            throw new Error("Login response did not contain an access token.");
        }

        token = data.access_token;

        currentUser = {
            email,
            name: data.name || email.split("@")[0]
        };

        localStorage.setItem("spendsmart_token", token);

        localStorage.setItem(
            "spendsmart_user",
            JSON.stringify(currentUser)
        );

        await openDashboard();

    } catch (error) {
        showMessage("authMessage", error.message);
        console.error("Login error:", error);
    } finally {
        setButtonLoading(button, false, "Login");
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const name = $("registerName").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;

    const button = $("registerForm").querySelector(
        'button[type="submit"]'
    );

    try {
        showMessage("registerMessage", "Creating your account...");
        setButtonLoading(button, true, "Create Account");

        await apiRequest("/register", {
            method: "POST",
            body: JSON.stringify({
                name,
                email,
                password
            })
        });

        $("registerForm").reset();

        $("registerSection").hidden = true;
        $("loginSection").hidden = false;

        $("loginEmail").value = email;

        showMessage(
            "authMessage",
            "Account created successfully! Please login.",
            true
        );

    } catch (error) {
        showMessage("registerMessage", error.message);
        console.error("Registration error:", error);
    } finally {
        setButtonLoading(button, false, "Create Account");
    }
}

function switchToRegister(event) {
    event.preventDefault();

    $("loginSection").hidden = true;
    $("registerSection").hidden = false;

    showMessage("registerMessage", "");
}

function switchToLogin(event) {
    event.preventDefault();

    $("registerSection").hidden = true;
    $("loginSection").hidden = false;

    showMessage("authMessage", "");
}

/* -------------------- DASHBOARD -------------------- */

async function openDashboard() {
    showAppView();

    const name = currentUser?.name || "User";

    $("userName").textContent = name;
    $("welcomeText").textContent = `Welcome back, ${name}!`;
    $("settingsUserEmail").textContent = currentUser?.email || "";

    $("expenseDate").value = getToday();

    // Default to current month only if no month is selected.
    if (!trackingMonthInput.value) {
        const current = getCurrentMonth();
        setSelectedTrackingMonth(current.month, current.year);
    }

    const selected = getSelectedTrackingMonth();

    $("budgetMonth").value = String(selected.month);
    $("budgetYear").value = selected.year;

    await loadDashboard();
}

async function loadDashboard() {
    try {
        // Read the month selected by the user.
        const { month, year } = getSelectedTrackingMonth();

        const [dashboardData, expenseData] = await Promise.all([
            apiRequest(`/dashboard?month=${month}&year=${year}`),
            apiRequest("/expenses")
        ]);

        // Keep all expenses so the annual chart can use the selected year.
        allExpenses = Array.isArray(expenseData) ? expenseData : [];

        // Filter transactions to the selected month.
        const selectedMonth = getSelectedMonthString();

        expenses = allExpenses.filter(expense => {
            return String(expense.date || "").startsWith(selectedMonth);
        });

        updateDashboard(dashboardData);
        updateBudgetOverview(dashboardData);

        renderTransactions();
        renderCharts();
        generateSmartAlerts(dashboardData);

        // Keep budget form aligned with selected dashboard month.
        $("budgetMonth").value = String(month);
        $("budgetYear").value = year;

    } catch (error) {
        console.error("Dashboard loading error:", error);

        if (error.status === 401) {
            clearSession(false);

            showMessage(
                "authMessage",
                "Your session expired. Please login again."
            );

            return;
        }

        alert("Unable to load dashboard: " + error.message);
    }
}

function updateDashboard(data) {
    const spent = Number(data.total_expenses || 0);
    const budget = Number(data.monthly_budget || 0);

    const remaining = Number(
        data.remaining_budget ?? budget - spent
    );

    const percentage = budget > 0
        ? (spent / budget) * 100
        : 0;

    const safePercentage = Math.min(percentage, 100);

    $("totalBudget").textContent = formatMoney(budget);
    $("totalSpent").textContent = formatMoney(spent);
    $("remainingBudget").textContent = formatMoney(remaining);

    $("budgetUsed").textContent = `${Math.round(percentage)}%`;
    $("budgetProgressText").textContent = `${Math.round(percentage)}%`;

    $("budgetProgress").style.width = `${safePercentage}%`;

    const { month, year } = getSelectedTrackingMonth();

    if (percentage >= 100) {
        $("budgetProgress").style.background = "#e45d72";

        $("budgetMessage").textContent =
            `You have exceeded your ${getMonthName(month)} ${year} budget!`;

    } else if (percentage >= 80) {
        $("budgetProgress").style.background = "#e99a42";

        $("budgetMessage").textContent =
            "Warning: You have used most of your monthly budget.";

    } else {
        $("budgetProgress").style.background =
            "linear-gradient(90deg, #7047d7, #a88bf3)";

        $("budgetMessage").textContent =
            `Tracking your spending for ${getMonthName(month)} ${year}.`;
    }
}

function updateBudgetOverview(data) {
    const budget = Number(data.monthly_budget || 0);
    const spent = Number(data.total_expenses || 0);

    const remaining = Number(
        data.remaining_budget ?? budget - spent
    );

    const { month, year } = getSelectedTrackingMonth();

    $("budgetOverview").textContent =
        `${getMonthName(month)} ${year} | ` +
        `Monthly budget: ${formatMoney(budget)} | ` +
        `Spent: ${formatMoney(spent)} | ` +
        `Remaining: ${formatMoney(remaining)}`;
}

/* -------------------- MONTH SELECTOR -------------------- */

function handleTrackingMonthChange() {
    if (!trackingMonthInput.value) return;

    loadDashboard();
}

/* -------------------- EXPENSE MODAL -------------------- */

function openExpenseModal(expense = null) {
    editingExpenseId = expense ? expense.id : null;

    $("expenseForm").reset();

    $("expenseDescription").value =
        expense?.description || "";

    $("expenseAmount").value =
        expense?.amount || "";

    $("expenseCategory").value =
        expense?.category || "";

    $("expenseDate").value =
        expense?.date || getToday();

    $("expensePaymentMethod").value =
        expense?.payment_method || "Cash";

    $("expenseModalTitle").textContent =
        expense ? "Edit Expense" : "Add New Expense";

    showMessage("expenseMessage", "");
    setVisible("expenseModal", true);
}

function closeExpenseModal() {
    setVisible("expenseModal", false);
    $("expenseForm").reset();
    editingExpenseId = null;
}

async function handleExpenseSubmit(event) {
    event.preventDefault();

    const expense = {
        description: $("expenseDescription").value.trim(),
        amount: Number($("expenseAmount").value),
        category: $("expenseCategory").value,
        date: $("expenseDate").value,
        payment_method: $("expensePaymentMethod").value
    };

    if (
        !expense.description ||
        !expense.date ||
        !expense.category
    ) {
        showMessage(
            "expenseMessage",
            "Please fill in all required fields."
        );

        return;
    }

    if (
        !Number.isFinite(expense.amount) ||
        expense.amount <= 0
    ) {
        showMessage(
            "expenseMessage",
            "Enter a valid amount greater than zero."
        );

        return;
    }

    try {
        const endpoint = editingExpenseId
            ? `/expenses/${editingExpenseId}`
            : "/expenses";

        await apiRequest(endpoint, {
            method: editingExpenseId ? "PUT" : "POST",
            body: JSON.stringify(expense)
        });

        // Automatically switch to the expense's month.
        const [year, month] = expense.date.split("-").map(Number);

        setSelectedTrackingMonth(month, year);

        closeExpenseModal();

        await loadDashboard();

    } catch (error) {
        showMessage("expenseMessage", error.message);
        console.error("Expense save error:", error);
    }
}

/* -------------------- TRANSACTIONS -------------------- */

function createTransactionRow(expense) {
    const row = document.createElement("tr");

    const description = document.createElement("td");
    description.textContent = expense.description || "Expense";

    const category = document.createElement("td");
    category.textContent = expense.category || "Other";

    const date = document.createElement("td");
    date.textContent = expense.date || "-";

    const amount = document.createElement("td");
    amount.textContent = formatMoney(expense.amount);

    const actions = document.createElement("td");

    const editButton = document.createElement("button");

    editButton.type = "button";
    editButton.className = "outline-btn";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
        openExpenseModal(expense);
    });

    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "outline-btn";
    deleteButton.textContent = "Delete";
    deleteButton.style.marginLeft = "5px";

    deleteButton.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to delete this expense?")) {
            return;
        }

        try {
            await apiRequest(`/expenses/${expense.id}`, {
                method: "DELETE"
            });

            await loadDashboard();

        } catch (error) {
            alert("Could not delete expense: " + error.message);
        }
    });

    actions.append(editButton, deleteButton);

    row.append(
        description,
        category,
        date,
        amount,
        actions
    );

    return row;
}

function renderTransactions() {
    const recentList = $("transactionList");
    const allList = $("allTransactionList");

    const sorted = [...expenses].sort((a, b) =>
        String(b.date || "").localeCompare(String(a.date || ""))
    );

    recentList.innerHTML = "";
    allList.innerHTML = "";

    if (sorted.length === 0) {
        const { month, year } = getSelectedTrackingMonth();

        const emptyMessage =
            `No transactions found for ${getMonthName(month)} ${year}.`;

        recentList.innerHTML =
            `<tr><td colspan="5" class="empty-state">${emptyMessage}</td></tr>`;

        allList.innerHTML =
            `<tr><td colspan="5" class="empty-state">${emptyMessage}</td></tr>`;

        return;
    }

    sorted.slice(0, 5).forEach(expense => {
        recentList.appendChild(createTransactionRow(expense));
    });

    sorted.forEach(expense => {
        allList.appendChild(createTransactionRow(expense));
    });
}

function filterTransactions() {
    const search = $("searchExpense").value.toLowerCase().trim();
    const category = $("filterCategory").value;
    const date = $("filterDate").value;

    const filtered = expenses.filter(expense => {
        const description =
            (expense.description || "").toLowerCase();

        const expenseCategory =
            (expense.category || "").toLowerCase();

        const matchesSearch =
            description.includes(search) ||
            expenseCategory.includes(search);

        const matchesCategory =
            !category || expense.category === category;

        const matchesDate =
            !date || expense.date === date;

        return matchesSearch && matchesCategory && matchesDate;
    });

    const container = $("allTransactionList");
    container.innerHTML = "";

    if (filtered.length === 0) {
        container.innerHTML =
            '<tr><td colspan="5" class="empty-state">No matching transactions found.</td></tr>';

        return;
    }

    filtered.forEach(expense => {
        container.appendChild(createTransactionRow(expense));
    });
}

/* -------------------- CHARTS -------------------- */

function getCategoryTotals() {
    const totals = {};

    expenses.forEach(expense => {
        const category = expense.category || "Other";

        totals[category] =
            (totals[category] || 0) + Number(expense.amount || 0);
    });

    return totals;
}

function getMonthlyTotals() {
    const totals = Array(12).fill(0);
    const { year } = getSelectedTrackingMonth();

    allExpenses.forEach(expense => {
        if (!expense.date) return;

        const date = new Date(`${expense.date}T00:00:00`);

        if (date.getFullYear() === year) {
            totals[date.getMonth()] += Number(expense.amount || 0);
        }
    });

    return totals;
}

function destroyCharts() {
    [
        categoryChart,
        monthlyChart,
        analyticsCategoryChart,
        analyticsMonthlyChart
    ].forEach(chart => {
        if (chart) chart.destroy();
    });

    categoryChart = null;
    monthlyChart = null;
    analyticsCategoryChart = null;
    analyticsMonthlyChart = null;
}

function createCategoryChart(canvasId) {
    const canvas = $(canvasId);

    if (!canvas || typeof Chart === "undefined") return null;

    const categoryTotals = getCategoryTotals();

    return new Chart(canvas, {
        type: "doughnut",

        data: {
            labels: Object.keys(categoryTotals),

            datasets: [{
                data: Object.values(categoryTotals),

                backgroundColor: [
                    "#7047d7",
                    "#e45d8a",
                    "#21a67a",
                    "#e99a42",
                    "#5299d3",
                    "#a78bfa"
                ],

                borderWidth: 0
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    position: "bottom"
                }
            }
        }
    });
}

function createMonthlyChart(canvasId) {
    const canvas = $(canvasId);

    if (!canvas || typeof Chart === "undefined") return null;

    const { year } = getSelectedTrackingMonth();

    return new Chart(canvas, {
        type: "bar",

        data: {
            labels: [
                "Jan", "Feb", "Mar", "Apr",
                "May", "Jun", "Jul", "Aug",
                "Sep", "Oct", "Nov", "Dec"
            ],

            datasets: [{
                label: `Expenses in ${year}`,
                data: getMonthlyTotals(),
                backgroundColor: "#8b6ce0",
                borderRadius: 7
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            },

            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function renderCharts() {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js could not be loaded.");
        return;
    }

    destroyCharts();

    categoryChart = createCategoryChart("categoryChart");
    monthlyChart = createMonthlyChart("monthlyChart");

    // Only create analytics charts when the analytics page is visible.
    const analyticsPage = $("analyticsPage");

    if (analyticsPage && !analyticsPage.hidden) {
        analyticsCategoryChart =
            createCategoryChart("analyticsCategoryChart");

        analyticsMonthlyChart =
            createMonthlyChart("analyticsMonthlyChart");
    }
}

/* -------------------- SMART ALERTS -------------------- */

function generateSmartAlerts(data) {
    const alerts = [];

    const spent = Number(data.total_expenses || 0);
    const budget = Number(data.monthly_budget || 0);

    const percentage = budget > 0
        ? (spent / budget) * 100
        : 0;

    if (budget <= 0) {
        alerts.push({
            title: "Set your monthly budget",
            message: "Create a budget to start monitoring your spending.",
            icon: "fa-lightbulb"
        });

    } else if (percentage >= 100) {
        alerts.push({
            title: "Budget exceeded!",
            message: "Your expenses have crossed your monthly limit.",
            icon: "fa-triangle-exclamation"
        });

    } else if (percentage >= 80) {
        alerts.push({
            title: "Budget warning",
            message: "You have used more than 80% of your budget.",
            icon: "fa-circle-exclamation"
        });
    }

    const highestCategory = Object.entries(getCategoryTotals())
        .sort((a, b) => b[1] - a[1])[0];

    if (highestCategory) {
        alerts.push({
            title: "Top spending category",
            message: `${highestCategory[0]} is your highest spending category.`,
            icon: "fa-chart-pie"
        });
    }

    $("alertsList").innerHTML = "";
    $("notificationsList").innerHTML = "";

    $("notificationCount").textContent = alerts.length;

    if (alerts.length === 0) {
        $("alertsList").textContent = "No alerts right now.";
        $("notificationsList").textContent = "No new notifications.";
        return;
    }

    alerts.forEach(alert => {
        const item = document.createElement("div");
        item.className = "alert-item";

        const icon = document.createElement("i");
        icon.className = `fa-solid ${alert.icon}`;

        const content = document.createElement("div");

        const title = document.createElement("h4");
        title.textContent = alert.title;

        const message = document.createElement("p");
        message.textContent = alert.message;

        content.append(title, message);
        item.append(icon, content);

        $("alertsList").appendChild(item);

        $("notificationsList").appendChild(item.cloneNode(true));
    });
}

/* -------------------- BUDGET -------------------- */

function openBudgetModal() {
    const { month, year } = getSelectedTrackingMonth();

    $("budgetMonth").value = String(month);
    $("budgetYear").value = year;

    $("budgetAmount").value = "";

    showMessage("budgetFormMessage", "");

    setVisible("budgetModal", true);
}

function closeBudgetModal() {
    setVisible("budgetModal", false);
    $("budgetForm").reset();
}

async function handleBudgetSubmit(event) {
    event.preventDefault();

    const budgetData = {
        amount: Number($("budgetAmount").value),
        month: Number($("budgetMonth").value),
        year: Number($("budgetYear").value)
    };

    if (
        !Number.isFinite(budgetData.amount) ||
        budgetData.amount <= 0
    ) {
        showMessage(
            "budgetFormMessage",
            "Enter a valid budget amount."
        );

        return;
    }

    try {
        await apiRequest("/budgets", {
            method: "POST",
            body: JSON.stringify(budgetData)
        });

        // Show the month for which the budget was saved.
        setSelectedTrackingMonth(
            budgetData.month,
            budgetData.year
        );

        closeBudgetModal();

        await loadDashboard();

        alert("Budget saved successfully!");

    } catch (error) {
        showMessage("budgetFormMessage", error.message);
        console.error("Budget save error:", error);
    }
}

/* -------------------- CSV EXPORT -------------------- */

function exportCSV() {
    if (expenses.length === 0) {
        alert("There are no transactions to export for this month.");
        return;
    }

    const rows = [
        ["Description", "Category", "Date", "Amount", "Payment Method"]
    ];

    expenses.forEach(expense => {
        rows.push([
            expense.description || "",
            expense.category || "",
            expense.date || "",
            expense.amount || 0,
            expense.payment_method || ""
        ]);
    });

    const csv = rows.map(row =>
        row.map(value =>
            `"${String(value).replace(/"/g, '""')}"`
        ).join(",")
    ).join("\n");

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const { month, year } = getSelectedTrackingMonth();

    link.href = url;
    link.download =
        `SpendSmart_${getMonthName(month)}_${year}.csv`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

/* -------------------- NAVIGATION -------------------- */

function showPage(page) {
    if (!pageNames.includes(page)) return;

    pageNames.forEach(name => {
        const section = $(`${name}Page`);

        if (section) {
            section.hidden = name !== page;
            section.style.display = name === page ? "" : "none";
        }
    });

    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === page
        );
    });

    $("pageTitle").textContent =
        page.charAt(0).toUpperCase() + page.slice(1);

    if (page === "analytics") {
        renderCharts();
    }

    $("sidebar").classList.remove("open");
}

/* -------------------- THEME -------------------- */

function applySavedTheme() {
    const darkMode =
        localStorage.getItem("spendsmart_dark_mode") === "true";

    document.body.classList.toggle("dark-mode", darkMode);

    $("themeToggle").innerHTML = darkMode
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
}

function toggleTheme() {
    const darkMode =
        document.body.classList.toggle("dark-mode");

    localStorage.setItem(
        "spendsmart_dark_mode",
        String(darkMode)
    );

    $("themeToggle").innerHTML = darkMode
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
}

/* -------------------- LOGOUT -------------------- */

function clearSession(showMessageAfter = true) {
    token = null;
    currentUser = null;

    expenses = [];
    allExpenses = [];

    localStorage.removeItem("spendsmart_token");
    localStorage.removeItem("spendsmart_user");

    destroyCharts();

    showAuthView();

    $("loginForm").reset();
    $("registerForm").reset();

    $("loginSection").hidden = false;
    $("registerSection").hidden = true;

    if (showMessageAfter) {
        showMessage(
            "authMessage",
            "You have logged out.",
            true
        );
    }
}

function logout() {
    if (!confirm("Are you sure you want to logout?")) return;

    clearSession(true);
}

/* -------------------- EVENT LISTENERS -------------------- */

function initializeEventListeners() {
    $("loginForm").addEventListener("submit", handleLogin);
    $("registerForm").addEventListener("submit", handleRegister);

    $("showRegister").addEventListener("click", switchToRegister);
    $("showLogin").addEventListener("click", switchToLogin);

    $("addExpenseBtn").addEventListener("click", () => {
        openExpenseModal();
    });

    $("addExpenseBtn2").addEventListener("click", () => {
        openExpenseModal();
    });

    $("closeExpenseModal").addEventListener(
        "click",
        closeExpenseModal
    );

    $("expenseForm").addEventListener(
        "submit",
        handleExpenseSubmit
    );

    $("manageBudgetBtn").addEventListener(
        "click",
        openBudgetModal
    );

    $("openBudgetBtn").addEventListener(
        "click",
        openBudgetModal
    );

    $("closeBudgetModal").addEventListener(
        "click",
        closeBudgetModal
    );

    $("budgetForm").addEventListener(
        "submit",
        handleBudgetSubmit
    );

    $("searchExpense").addEventListener(
        "input",
        filterTransactions
    );

    $("filterCategory").addEventListener(
        "change",
        filterTransactions
    );

    $("filterDate").addEventListener(
        "change",
        filterTransactions
    );

    $("exportCsvBtn").addEventListener(
        "click",
        exportCSV
    );

    // Dashboard month selector.
    if (trackingMonthInput) {
        trackingMonthInput.addEventListener(
            "change",
            handleTrackingMonthChange
        );
    }

    document.querySelectorAll("[data-page]").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            showPage(link.dataset.page);
        });
    });

    $("menuToggle").addEventListener("click", () => {
        $("sidebar").classList.toggle("open");
    });

    $("themeToggle").addEventListener(
        "click",
        toggleTheme
    );

    $("logoutBtn").addEventListener("click", logout);
    $("settingsLogoutBtn").addEventListener("click", logout);

    $("notificationBtn").addEventListener("click", () => {
        showPage("notifications");
    });

    $("expenseModal").addEventListener("click", event => {
        if (event.target === $("expenseModal")) {
            closeExpenseModal();
        }
    });

    $("budgetModal").addEventListener("click", event => {
        if (event.target === $("budgetModal")) {
            closeBudgetModal();
        }
    });
}

/* -------------------- START APPLICATION -------------------- */

document.addEventListener("DOMContentLoaded", async () => {
    initializeEventListeners();
    applySavedTheme();

    // Set the current month as the initial selection.
    const current = getCurrentMonth();

    if (trackingMonthInput && !trackingMonthInput.value) {
        setSelectedTrackingMonth(
            current.month,
            current.year
        );
    }

    showAuthView();

    if (token) {
        try {
            await openDashboard();

        } catch (error) {
            console.error("Session restore error:", error);

            clearSession(false);

            showMessage(
                "authMessage",
                "Please login again to continue."
            );
        }
    }
});
