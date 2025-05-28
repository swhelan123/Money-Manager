// ---------- Data layer ----------
const STORAGE_KEY = "money-manager-data";
let currentMap = null;
let modalInitialized = false;
let currentTxIndex = -1;
let currentView = "transactions"; // Can be: transactions, charts, budgets
let data = {
  balances: { cu: 0, revolut: 0, cash: 0 },
  transactions: [],
  categories: [
    "Food & Dining",
    "Shopping",
    "Transportation",
    "Bills & Utilities",
    "Entertainment",
    "Health & Fitness",
    "Travel",
    "Education",
    "Personal Care",
    "Gifts & Donations",
    "Income",
    "Other"
  ],
  budgets: {},
  settings: {
    theme: "light",
    pinnedTransactions: [],
    recurringTransactions: []
  }
};

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const savedData = JSON.parse(saved);
    // Ensure backward compatibility with older data structure
    data = {
      balances: savedData.balances || { cu: 0, revolut: 0, cash: 0 },
      transactions: savedData.transactions || [],
      categories: savedData.categories || [
        "Food & Dining",
        "Shopping",
        "Transportation",
        "Bills & Utilities",
        "Entertainment",
        "Health & Fitness",
        "Travel",
        "Education",
        "Personal Care",
        "Gifts & Donations",
        "Income",
        "Other"
      ],
      budgets: savedData.budgets || {},
      settings: savedData.settings || {
        theme: "light",
        pinnedTransactions: [],
        recurringTransactions: []
      }
    };

    // Migrate existing transactions to include new fields if they don't exist
    data.transactions = data.transactions.map(tx => {
      return {
        ...tx,
        category: tx.category || (tx.type === "income" ? "Income" : "Other"),
        isRecurring: tx.isRecurring || false,
        isPinned: tx.isPinned || false,
        notes: tx.notes || "",
        attachments: tx.attachments || []
      };
    });
  }

  // Apply theme from settings
  applyTheme(data.settings.theme);
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- UI rendering ----------
function formatAmt(a) {
  return "€" + a.toFixed(2);
}
function renderBalances() {
  document.querySelectorAll(".card[data-account]").forEach((card) => {
    const acc = card.dataset.account;
    let balance = data.balances[acc] !== undefined ? data.balances[acc] : 0;
    card.querySelector(".balance").textContent = formatAmt(balance);
  });
  renderTotalBalance();
}

function renderTotalBalance() {
  const total = Object.values(data.balances).reduce((sum, balance) => sum + balance, 0);
  document.getElementById("total-balance").textContent = formatAmt(total);
}
// Global filters and sort state
let filters = {
  account: "all",
  type: "all"
};
let sortOrder = "date-desc";

function renderTransactions() {
  const ul = document.getElementById("tx-list");
  ul.innerHTML = "";

  // Filter transactions
  let filteredTransactions = data.transactions.filter(tx => {
    if (filters.account !== "all" && tx.account !== filters.account) return false;
    if (filters.type !== "all" && tx.type !== filters.type) return false;
    return true;
  });

  // Sort transactions
  switch (sortOrder) {
    case "date-desc":
      filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "date-asc":
      filteredTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "amount-desc":
      filteredTransactions.sort((a, b) => b.amount - a.amount);
      break;
    case "amount-asc":
      filteredTransactions.sort((a, b) => a.amount - b.amount);
      break;
  }

  // Check for pinned transactions first
  const pinnedTransactions = filteredTransactions.filter(tx => tx.isPinned);
  const regularTransactions = filteredTransactions.filter(tx => !tx.isPinned);

  // Process pinned transactions first, then regular ones
  [...pinnedTransactions, ...regularTransactions].forEach((tx) => {
    const li = document.createElement("li");
    li.setAttribute("data-account", tx.account);
    li.setAttribute("data-id", tx.id || "tx-" + Math.random().toString(36).substr(2, 9));

    // Add class for pinned transactions
    if (tx.isPinned) {
      li.classList.add("pinned");
    }

    // Add recurring indicator if applicable
    const recurringIcon = tx.isRecurring ?
      `<i class="fas fa-sync-alt recurring-icon" title="Recurring Transaction"></i>` : '';

    li.innerHTML = `
      <span>
        <i class="fas fa-${tx.type === "expense" ? "arrow-down" : "arrow-up"}"
           style="color: var(--${tx.type}-color);"></i>
        <span class="account-dot" style="background-color: var(--${tx.account}-color);"></span>
        ${tx.description || "(no desc)"}
        ${recurringIcon}
        ${tx.category ? `<span class="category-tag">${tx.category}</span>` : ''}
      </span>
      <span>${formatAmt(tx.amount)}</span>
    `;
    li.addEventListener("click", function () {
      const index = data.transactions.findIndex(t =>
        t.date === tx.date &&
        t.amount === tx.amount &&
        t.description === tx.description &&
        t.type === tx.type &&
        t.account === tx.account
      );
      currentTxIndex = index;

      const modal = document.getElementById("transaction-modal");
      const info = document.getElementById("tx-info");
      const mapPreview = document.getElementById("map-preview");

      let detailsHtml = "<p><strong>Description:</strong> " + (tx.description || "(no desc)") + "</p>" +
                        "<p><strong>Account:</strong> " + (tx.account === "cu" ? "Credit Union" : tx.account === "revolut" ? "Revolut" : "Cash") + "</p>" +
                        "<p><strong>Type:</strong> " + tx.type + "</p>" +
                        "<p><strong>Amount:</strong> " + formatAmt(tx.amount) + "</p>" +
                        "<p><strong>Date:</strong> " + tx.date + "</p>" +
                        "<p><strong>Category:</strong> " + (tx.category || "Uncategorized") + "</p>";

      // Add recurring info if applicable
      if (tx.isRecurring) {
        detailsHtml += "<p><strong>Recurring:</strong> Yes</p>";
      }

      // Add notes if available
      if (tx.notes && tx.notes.trim() !== "") {
        detailsHtml += "<p><strong>Notes:</strong> " + tx.notes + "</p>";
      }

      // Add attachments if available
      if (tx.attachments && tx.attachments.length > 0) {
        detailsHtml += "<div class='attachment-section'><strong>Attachments:</strong><div class='attachment-list'>";
        tx.attachments.forEach(attachment => {
          detailsHtml += `<div class='attachment-item'><img src='${attachment.data}' alt='Receipt'></div>`;
        });
        detailsHtml += "</div></div>";
      }
      info.innerHTML = detailsHtml;

      // Clear previous map
      mapPreview.innerHTML = "";
      if (currentMap) {
          currentMap.remove();
          currentMap = null;
      }

      // Store current scroll position before opening modal
      const scrollPos = window.scrollY;
      modal.classList.remove("hidden");
      document.body.classList.add("modal-open");
      // Store scroll position as data attribute on modal
      modal.dataset.scrollPosition = scrollPos;

      // Initialize map after modal is visible
      setTimeout(() => {
        if (tx.location) {
          try {
            currentMap = L.map("map-preview").setView([tx.location.latitude, tx.location.longitude], 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: "&copy; OpenStreetMap contributors",
            }).addTo(currentMap);
            L.marker([tx.location.latitude, tx.location.longitude]).addTo(currentMap);
            // Force map to recalculate size
            currentMap.invalidateSize();
          } catch (e) {
            console.error("Error initializing map:", e);
            mapPreview.innerHTML = "<div class='no-location'>Error loading map</div>";
          }
        } else {
          mapPreview.innerHTML = "<div class='no-location'>No location data available</div>";
        }
      }, 100);
    });
    ul.appendChild(li);
  });

  // Display message if no transactions match filters
  if (filteredTransactions.length === 0) {
    ul.innerHTML = "<li class='no-transactions'>No transactions match your filters</li>";
  }
}

// ---------- Modal/Form logic ----------
const modal = document.getElementById("tx-modal");
document.getElementById("add-btn").onclick = () => modal.classList.remove("hidden");
document.getElementById("cancel-btn").onclick = () => modal.classList.add("hidden");

document.getElementById("tx-form").addEventListener("submit", function (e) {
  e.preventDefault();
  const amt = parseFloat(document.getElementById("tx-amount").value);
  const acc = document.getElementById("tx-account").value;
  const type = document.getElementById("tx-type").value;
  const desc = document.getElementById("tx-desc").value;
  const date = document.getElementById("tx-date").value;
  const category = document.getElementById("tx-category").value;
  const isRecurring = document.getElementById("tx-recurring").checked;
  const isPinned = document.getElementById("tx-pinned").checked;
  const notes = document.getElementById("tx-notes").value;
  const fileInput = document.getElementById("tx-attachment");

  // Generate a unique ID for the transaction
  const txId = "tx-" + Math.random().toString(36).substr(2, 9);

  let transaction = {
    id: txId,
    amount: amt,
    account: acc,
    type,
    description: desc,
    date,
    category,
    isRecurring,
    isPinned,
    notes,
    attachments: []
  };

  const completeTransaction = (location, attachments = []) => {
    if (location) {
      transaction.location = location;
    }

    if (attachments && attachments.length > 0) {
      transaction.attachments = attachments;
    }

    data.transactions.push(transaction);
    data.balances[acc] += type === "expense" ? -amt : amt;

    // Handle pinned status
    if (isPinned) {
      data.settings.pinnedTransactions.push(txId);
    }

    // Handle recurring transactions
    if (isRecurring) {
      // Add to recurring transactions with scheduling info
      data.settings.recurringTransactions.push({
        transactionId: txId,
        schedule: 'monthly', // Default to monthly
        nextDueDate: new Date(date).setMonth(new Date(date).getMonth() + 1) // Next month
      });
    }

    saveData();
    renderBalances();
    renderTransactions();
    renderTotalBalance();
    updateCharts();
    modal.classList.add("hidden");
    e.target.reset();

    // Clear attachment preview
    document.getElementById("tx-attachments-preview").innerHTML = "";
  };

  // Process attachments if any
  if (fileInput.files.length > 0) {
    processAttachments(fileInput.files).then(attachments => {
      // Request geolocation if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function (position) {
            completeTransaction({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }, attachments);
          },
          function (error) {
            console.log("Location error or permission denied:", error);
            completeTransaction(null, attachments);
          },
        );
      } else {
        completeTransaction(null, attachments);
      }
    });
  } else {
    // No attachments, proceed with geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          completeTransaction({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        function (error) {
          console.log("Location error or permission denied:", error);
          completeTransaction(null);
        },
      );
    } else {
      completeTransaction(null);
    }
  }
});

// Delete a transaction
function deleteTransaction(index) {
  if (index < 0 || index >= data.transactions.length) return;

  const tx = data.transactions[index];
  // Reverse the effect on balance
  data.balances[tx.account] -= tx.type === "expense" ? -tx.amount : tx.amount;

  // If it's a pinned transaction, remove from pinned list
  if (tx.isPinned) {
    const txId = tx.id || index;
    data.settings.pinnedTransactions = data.settings.pinnedTransactions.filter(id => id !== txId);
  }

  // Remove the transaction
  data.transactions.splice(index, 1);

  // Save and update UI
  saveData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();
  updateCharts();

  // Hide modal
  document.getElementById("transaction-modal").classList.add("hidden");
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
}

// Open edit transaction modal and populate with transaction data
function openEditTransactionModal(index) {
  if (index < 0 || index >= data.transactions.length) return;

  const tx = data.transactions[index];

  // Populate the edit form with transaction data
  document.getElementById("edit-tx-amount").value = tx.amount;
  document.getElementById("edit-tx-account").value = tx.account;
  document.getElementById("edit-tx-type").value = tx.type;
  document.getElementById("edit-tx-desc").value = tx.description || "";
  document.getElementById("edit-tx-date").value = tx.date;
  document.getElementById("edit-tx-category").value = tx.category || "Other";
  document.getElementById("edit-tx-recurring").checked = tx.isRecurring || false;
  document.getElementById("edit-tx-pinned").checked = tx.isPinned || false;
  document.getElementById("edit-tx-notes").value = tx.notes || "";

  // Display existing attachments if any
  const attachmentContainer = document.getElementById("edit-tx-attachments-preview");
  attachmentContainer.innerHTML = "";
  if (tx.attachments && tx.attachments.length > 0) {
    tx.attachments.forEach((attachment, i) => {
      const img = document.createElement("div");
      img.className = "attachment-preview";
      img.innerHTML = `
        <img src="${attachment.data}" alt="Attachment ${i+1}">
        <button type="button" class="remove-attachment" data-index="${i}">×</button>
      `;
      attachmentContainer.appendChild(img);
    });

    // Add event listeners to remove buttons
    attachmentContainer.querySelectorAll(".remove-attachment").forEach(btn => {
      btn.addEventListener("click", function() {
        const attachmentIndex = parseInt(this.dataset.index);
        // We'll update the attachments array in the saveEditedTransaction function
        this.parentElement.remove();
      });
    });
  }

  // Hide transaction modal and show edit modal
  document.getElementById("transaction-modal").classList.add("hidden");
  document.getElementById("edit-tx-modal").classList.remove("hidden");
  document.body.classList.add("modal-open");

  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }
}

// Save edited transaction
function saveEditedTransaction() {
  if (currentTxIndex < 0 || currentTxIndex >= data.transactions.length) return;

  const oldTx = data.transactions[currentTxIndex];

  // Get values from edit form
  const newAmount = parseFloat(document.getElementById("edit-tx-amount").value);
  const newAccount = document.getElementById("edit-tx-account").value;
  const newType = document.getElementById("edit-tx-type").value;
  const newDesc = document.getElementById("edit-tx-desc").value;
  const newDate = document.getElementById("edit-tx-date").value;
  const newCategory = document.getElementById("edit-tx-category").value;
  const isRecurring = document.getElementById("edit-tx-recurring").checked;
  const isPinned = document.getElementById("edit-tx-pinned").checked;
  const notes = document.getElementById("edit-tx-notes").value;

  // Handle attachments - get existing ones minus any that were removed
  const existingAttachments = [...(oldTx.attachments || [])];
  const removedIndices = Array.from(document.querySelectorAll(".remove-attachment"))
    .map(el => parseInt(el.dataset.index));

  // Filter out removed attachments
  const remainingAttachments = existingAttachments.filter((_, i) =>
    !removedIndices.includes(i));

  // Add any new attachments from the file input
  const fileInput = document.getElementById("edit-tx-attachment");
  const newAttachments = [];
  if (fileInput.files.length > 0) {
    // We'll process these asynchronously, so we need to save the promise
    const attachmentPromise = processAttachments(fileInput.files)
      .then(attachments => {
        // Combine remaining and new attachments
        const allAttachments = [...remainingAttachments, ...attachments];

        // First, reverse the effect of the original transaction on the balance
        data.balances[oldTx.account] -= oldTx.type === "expense" ? -oldTx.amount : oldTx.amount;

        // Then, apply the effect of the new transaction values
        data.balances[newAccount] += newType === "expense" ? -newAmount : newAmount;

        // Update the transaction object with all fields
        const txId = oldTx.id || "tx-" + Math.random().toString(36).substr(2, 9);

        // Update the transaction object
        const updatedTx = {
          id: txId,
          amount: newAmount,
          account: newAccount,
          type: newType,
          description: newDesc,
          date: newDate,
          category: newCategory,
          isRecurring,
          isPinned,
          notes,
          location: oldTx.location, // Preserve original location data
          attachments: allAttachments
        };

        // Handle pinned status changes
        if (isPinned && !oldTx.isPinned) {
          // Add to pinned list
          if (!data.settings.pinnedTransactions.includes(txId)) {
            data.settings.pinnedTransactions.push(txId);
          }
        } else if (!isPinned && oldTx.isPinned) {
          // Remove from pinned list
          data.settings.pinnedTransactions = data.settings.pinnedTransactions.filter(id => id !== txId);
        }

        // Replace the transaction in the array
        data.transactions[currentTxIndex] = updatedTx;

        // Save and update UI
        saveData();
        renderBalances();
        renderTransactions();
        renderTotalBalance();
        updateCharts();

        // Hide reset modal
        document.getElementById("reset-confirm-modal").classList.add("hidden");
        document.body.classList.remove("modal-open");
      });

    return; // Exit early, the promise will handle the rest
  }

  // If no new attachments, we can update synchronously
  // First, reverse the effect of the original transaction on the balance
  data.balances[oldTx.account] -= oldTx.type === "expense" ? -oldTx.amount : oldTx.amount;

  // Then, apply the effect of the new transaction values
  data.balances[newAccount] += newType === "expense" ? -newAmount : newAmount;

  // Ensure transaction has an ID
  const txId = oldTx.id || "tx-" + Math.random().toString(36).substr(2, 9);

  // Update the transaction object with all fields
  const updatedTx = {
    id: txId,
    amount: newAmount,
    account: newAccount,
    type: newType,
    description: newDesc,
    date: newDate,
    category: newCategory,
    isRecurring,
    isPinned,
    notes,
    location: oldTx.location, // Preserve original location data
    attachments: remainingAttachments
  };

  // Handle pinned status changes
  if (isPinned && !oldTx.isPinned) {
    // Add to pinned list
    if (!data.settings.pinnedTransactions.includes(txId)) {
      data.settings.pinnedTransactions.push(txId);
    }
  } else if (!isPinned && oldTx.isPinned) {
    // Remove from pinned list
    data.settings.pinnedTransactions = data.settings.pinnedTransactions.filter(id => id !== txId);
  }

  // Replace the transaction in the array
  data.transactions[currentTxIndex] = updatedTx;

  // Save and update UI
  saveData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();
  updateCharts();

  // Hide edit modal
  document.getElementById("edit-tx-modal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

// Reset all data
function resetAllData() {
  // Show custom confirmation modal instead of browser confirm
  document.getElementById("reset-confirm-modal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function confirmReset() {
  data = {
    balances: { cu: 0, revolut: 0, cash: 0 },
    transactions: [],
  };
  saveData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();
  document.getElementById("reset-confirm-modal").classList.add("hidden");
}

// Balance over time chart
function initBalanceOverTimeChart() {
  // Set up event listeners for chart controls
  document.getElementById('balance-timespan').addEventListener('change', updateBalanceOverTimeChart);
  document.getElementById('balance-account').addEventListener('change', updateBalanceOverTimeChart);

  // Initial chart update
  updateBalanceOverTimeChart();
}

function updateBalanceOverTimeChart() {
  // Get selected timespan and account
  const timespan = document.getElementById('balance-timespan').value;
  const account = document.getElementById('balance-account').value;

  // Get current date
  const now = new Date();

  // Determine date range based on timespan
  let startDate, endDate = new Date();
  let interval = 'day';

  switch(timespan) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      interval = 'day';
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      interval = 'day';
      break;
    case 'quarter':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      interval = 'week';
      break;
    case 'year':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      interval = 'month';
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      interval = 'day';
  }
  
  // Create array of dates from start to end based on interval
  const dates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(new Date(current));
    
    switch(interval) {
      case 'day':
        current.setDate(current.getDate() + 1);
        break;
      case 'week':
        current.setDate(current.getDate() + 7);
        break;
      case 'month':
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }
  
  // Calculate balance at each date point
  const balances = [];
  
  // For each date, calculate the balance based on all transactions up to that date
  dates.forEach(date => {
    // Filter transactions up to this date
    const txUpToDate = data.transactions.filter(tx => new Date(tx.date) <= date);
    
    // Calculate balance for the selected account or all accounts (total)
    if (account === 'all') {
      // Calculate total balance across all accounts
      const totalBalance = Object.values(data.balances).reduce((sum, bal) => sum + bal, 0);
      
      // Adjust for transactions not included in the current date
      const futureTransactions = data.transactions.filter(tx => new Date(tx.date) > date);
      
      // Calculate the effect of future transactions on the balance
      const adjustment = futureTransactions.reduce((sum, tx) => {
        return sum + (tx.type === 'expense' ? tx.amount : -tx.amount);
      }, 0);
      
      // Add adjusted balance to array
      balances.push(totalBalance - adjustment);
    } else {
      // Calculate balance for specific account
      let accountBalance = data.balances[account] || 0;
      
      // Adjust for transactions not included in the current date
      const futureTransactions = data.transactions.filter(tx => 
        tx.account === account && new Date(tx.date) > date
      );
      
      // Calculate the effect of future transactions on the balance
      const adjustment = futureTransactions.reduce((sum, tx) => {
        return sum + (tx.type === 'expense' ? tx.amount : -tx.amount);
      }, 0);
      
      // Add adjusted balance to array
      balances.push(accountBalance - adjustment);
    }
  });
  
  // Format dates for display
  const formatDate = (date) => {
    switch(interval) {
      case 'day':
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      case 'week':
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      case 'month':
        return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }
  };
  
  // Format labels
  const labels = dates.map(formatDate);
  
  // Get the chart canvas
  const ctx = document.getElementById('balance-over-time-chart').getContext('2d');
  
  // Destroy existing chart if it exists
  if (window.balanceOverTimeChart) {
    window.balanceOverTimeChart.destroy();
  }
  
  // Determine chart title based on account selection
  let chartTitle = 'Balance Over Time';
  if (account !== 'all') {
    chartTitle += ` - ${account === 'cu' ? 'Credit Union' : account === 'revolut' ? 'Revolut' : 'Cash'}`;
  }
  
  // Get account color based on selection
  const chartColor = account === 'all' ? '#4a90e2' : 
                    account === 'cu' ? '#6a75ca' : 
                    account === 'revolut' ? '#f37736' : '#4caf50';
  
  // Create chart
  window.balanceOverTimeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Balance',
        data: balances,
        backgroundColor: `${chartColor}33`,
        borderColor: chartColor,
        borderWidth: 2,
        fill: true,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartTitle
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Balance: ${formatAmt(context.raw)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return formatAmt(value);
            }
          }
        }
      }
    }
  });
}

// ---------- Init ----------
// Process attachments (photos) for transactions
function processAttachments(files) {
  return new Promise((resolve, reject) => {
    const attachments = [];
    let processed = 0;

    if (files.length === 0) {
      resolve(attachments);
      return;
    }

    Array.from(files).forEach(file => {
      // Only process image files
      if (!file.type.match('image.*')) {
        processed++;
        if (processed === files.length) {
          resolve(attachments);
        }
        return;
      }

      const reader = new FileReader();

      reader.onload = function(e) {
        attachments.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: e.target.result
        });

        processed++;
        if (processed === files.length) {
          resolve(attachments);
        }
      };

      reader.onerror = function() {
        processed++;
        if (processed === files.length) {
          resolve(attachments);
        }
      };

      reader.readAsDataURL(file);
    });
  });
}

// Apply theme (light/dark)
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  data.settings.theme = theme;
  saveData();
}

// Toggle theme
function toggleTheme() {
  const currentTheme = data.settings.theme || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

// Create and update charts
function updateCharts() {
  if (!window.Chart) return; // Skip if Chart.js isn't loaded

  // Destroy existing charts to prevent duplicates
  if (window.incomeVsExpenseChart) window.incomeVsExpenseChart.destroy();
  if (window.categoryChart) window.categoryChart.destroy();
  if (window.accountBalanceChart) window.accountBalanceChart.destroy();
  if (window.balanceOverTimeChart) window.balanceOverTimeChart.destroy();

  // Get canvas contexts
  const incomeVsExpenseCtx = document.getElementById('income-expense-chart').getContext('2d');
  const categoryCtx = document.getElementById('category-chart').getContext('2d');
  const accountBalanceCtx = document.getElementById('account-balance-chart').getContext('2d');
  const balanceOverTimeCtx = document.getElementById('balance-over-time-chart')?.getContext('2d');
  if (!balanceOverTimeCtx) return; // Skip if canvas not found

  // Get current date
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Filter transactions for the current month
  const thisMonthTransactions = data.transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
  });

  // Income vs Expense data
  const income = thisMonthTransactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const expense = thisMonthTransactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Create income vs expense chart
  window.incomeVsExpenseChart = new Chart(incomeVsExpenseCtx, {
    type: 'bar',
    data: {
      labels: ['Income', 'Expense'],
      datasets: [{
        label: 'Amount (€)',
        data: [income, expense],
        backgroundColor: ['rgba(76, 175, 80, 0.6)', 'rgba(244, 67, 54, 0.6)'],
        borderColor: ['rgb(76, 175, 80)', 'rgb(244, 67, 54)'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Income vs Expense This Month'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  // Category data
  const categories = {};
  thisMonthTransactions.forEach(tx => {
    if (tx.type === 'expense') {
      const category = tx.category || 'Other';
      categories[category] = (categories[category] || 0) + tx.amount;
    }
  });

  // Create category chart
  window.categoryChart = new Chart(categoryCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(categories),
      datasets: [{
        data: Object.values(categories),
        backgroundColor: [
          'rgba(255, 99, 132, 0.6)',
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 206, 86, 0.6)',
          'rgba(75, 192, 192, 0.6)',
          'rgba(153, 102, 255, 0.6)',
          'rgba(255, 159, 64, 0.6)',
          'rgba(199, 199, 199, 0.6)',
          'rgba(83, 102, 255, 0.6)',
          'rgba(40, 159, 64, 0.6)',
          'rgba(210, 199, 199, 0.6)',
          'rgba(78, 52, 199, 0.6)',
          'rgba(225, 109, 64, 0.6)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Spending by Category'
        }
      }
    }
  });

  // Account balance chart
  window.accountBalanceChart = new Chart(accountBalanceCtx, {
    type: 'pie',
    data: {
      labels: ['Credit Union', 'Revolut', 'Cash'],
      datasets: [{
        data: [
          data.balances.cu || 0,
          data.balances.revolut || 0,
          data.balances.cash || 0
        ],
        backgroundColor: [
          'rgba(106, 117, 202, 0.6)',
          'rgba(243, 119, 54, 0.6)',
          'rgba(76, 175, 80, 0.6)'
        ],
        borderColor: [
          'rgb(106, 117, 202)',
          'rgb(243, 119, 54)',
          'rgb(76, 175, 80)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Balance Distribution'
        }
      }
    }
  });
}

// Search transactions
function searchTransactions(query) {
  if (!query || query.trim() === '') {
    renderTransactions();
    return;
  }

  query = query.toLowerCase().trim();

  // Filter transactions that match the query
  let searchResults = data.transactions.filter(tx => {
    const desc = (tx.description || '').toLowerCase();
    const category = (tx.category || '').toLowerCase();
    const date = tx.date;
    const amount = tx.amount.toString();
    const notes = (tx.notes || '').toLowerCase();

    return desc.includes(query) ||
           category.includes(query) ||
           date.includes(query) ||
           amount.includes(query) ||
           notes.includes(query);
  });

  // Update the transaction list with search results
  const ul = document.getElementById("tx-list");
  ul.innerHTML = "";

  if (searchResults.length === 0) {
    ul.innerHTML = "<li class='no-transactions'>No transactions match your search</li>";
    return;
  }

  // Apply current sort to search results
  switch (sortOrder) {
    case "date-desc":
      searchResults.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "date-asc":
      searchResults.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "amount-desc":
      searchResults.sort((a, b) => b.amount - a.amount);
      break;
    case "amount-asc":
      searchResults.sort((a, b) => a.amount - b.amount);
      break;
  }

  // Render search results
  searchResults.forEach((tx) => {
    const li = document.createElement("li");
    li.setAttribute("data-account", tx.account);
    li.setAttribute("data-id", tx.id || "tx-" + Math.random().toString(36).substr(2, 9));

    if (tx.isPinned) {
      li.classList.add("pinned");
    }

    const recurringIcon = tx.isRecurring ?
      `<i class="fas fa-sync-alt recurring-icon" title="Recurring Transaction"></i>` : '';

    li.innerHTML = `
      <span>
        <i class="fas fa-${tx.type === "expense" ? "arrow-down" : "arrow-up"}"
           style="color: var(--${tx.type}-color);"></i>
        <span class="account-dot" style="background-color: var(--${tx.account}-color);"></span>
        ${tx.description || "(no desc)"}
        ${recurringIcon}
        ${tx.category ? `<span class="category-tag">${tx.category}</span>` : ''}
      </span>
      <span>${formatAmt(tx.amount)}</span>
    `;

    li.addEventListener("click", function() {
      const index = data.transactions.findIndex(t =>
        t.id === tx.id ||
        (t.date === tx.date && t.amount === tx.amount && t.description === tx.description &&
         t.type === tx.type && t.account === tx.account)
      );

      if (index !== -1) {
        currentTxIndex = index;
        openTransactionDetails(tx);
      }
    });

    ul.appendChild(li);
  });
}

// Open transaction details modal
function openTransactionDetails(tx) {
  const modal = document.getElementById("transaction-modal");
  const info = document.getElementById("tx-info");
  const mapPreview = document.getElementById("map-preview");

  let detailsHtml = "<p><strong>Description:</strong> " + (tx.description || "(no desc)") + "</p>" +
                   "<p><strong>Account:</strong> " + (tx.account === "cu" ? "Credit Union" : tx.account === "revolut" ? "Revolut" : "Cash") + "</p>" +
                   "<p><strong>Type:</strong> " + tx.type + "</p>" +
                   "<p><strong>Amount:</strong> " + formatAmt(tx.amount) + "</p>" +
                   "<p><strong>Date:</strong> " + tx.date + "</p>" +
                   "<p><strong>Category:</strong> " + (tx.category || "Uncategorized") + "</p>";

  if (tx.isRecurring) {
    detailsHtml += "<p><strong>Recurring:</strong> Yes</p>";
  }

  if (tx.notes && tx.notes.trim() !== "") {
    detailsHtml += "<p><strong>Notes:</strong> " + tx.notes + "</p>";
  }

  if (tx.attachments && tx.attachments.length > 0) {
    detailsHtml += "<div class='attachment-section'><strong>Attachments:</strong><div class='attachment-list'>";
    tx.attachments.forEach(attachment => {
      detailsHtml += `<div class='attachment-item'><img src='${attachment.data}' alt='Receipt'></div>`;
    });
    detailsHtml += "</div></div>";
  }

  info.innerHTML = detailsHtml;

  // Update pin/unpin button text
  const pinBtn = document.getElementById("pin-tx-btn");
  if (tx.isPinned) {
    pinBtn.innerHTML = `<i class="fas fa-thumbtack"></i> Unpin`;
    pinBtn.classList.add("active");
  } else {
    pinBtn.innerHTML = `<i class="fas fa-thumbtack"></i> Pin`;
    pinBtn.classList.remove("active");
  }

  // Clear previous map
  mapPreview.innerHTML = "";
  if (currentMap) {
    currentMap.remove();
    currentMap = null;
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  // Initialize map after modal is visible
  setTimeout(() => {
    if (tx.location) {
      try {
        currentMap = L.map("map-preview").setView([tx.location.latitude, tx.location.longitude], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(currentMap);
        L.marker([tx.location.latitude, tx.location.longitude]).addTo(currentMap);
        // Force map to recalculate size
        currentMap.invalidateSize();
      } catch (e) {
        console.error("Error initializing map:", e);
        mapPreview.innerHTML = "<div class='no-location'>Error loading map</div>";
      }
    } else {
      mapPreview.innerHTML = "<div class='no-location'>No location data available</div>";
    }
  }, 100);
}

// Toggle pin status of a transaction
function togglePinTransaction(index) {
  if (index < 0 || index >= data.transactions.length) return;

  const tx = data.transactions[index];
  const txId = tx.id || "tx-" + Math.random().toString(36).substr(2, 9);

  // Ensure transaction has an ID
  if (!tx.id) {
    tx.id = txId;
  }

  // Toggle pinned status
  tx.isPinned = !tx.isPinned;

  // Update pinned transactions list in settings
  if (tx.isPinned) {
    if (!data.settings.pinnedTransactions.includes(txId)) {
      data.settings.pinnedTransactions.push(txId);
    }
  } else {
    data.settings.pinnedTransactions = data.settings.pinnedTransactions.filter(id => id !== txId);
  }

  // Save and update UI
  saveData();
  renderTransactions();

  // Update pin button in modal
  const pinBtn = document.getElementById("pin-tx-btn");
  if (tx.isPinned) {
    pinBtn.innerHTML = `<i class="fas fa-thumbtack"></i> Unpin`;
    pinBtn.classList.add("active");
  } else {
    pinBtn.innerHTML = `<i class="fas fa-thumbtack"></i> Pin`;
    pinBtn.classList.remove("active");
  }
}

// Handle date range filtering
function filterByDateRange(startDate, endDate) {
  // If no dates provided, clear filter
  if (!startDate && !endDate) {
    renderTransactions();
    return;
  }

  // Convert to Date objects if strings are provided
  if (startDate && typeof startDate === 'string') {
    startDate = new Date(startDate);
  }

  if (endDate && typeof endDate === 'string') {
    endDate = new Date(endDate);
    // Set time to end of day
    endDate.setHours(23, 59, 59, 999);
  }

  // Filter transactions by date range
  let filteredTx = data.transactions;

  if (startDate) {
    filteredTx = filteredTx.filter(tx => new Date(tx.date) >= startDate);
  }

  if (endDate) {
    filteredTx = filteredTx.filter(tx => new Date(tx.date) <= endDate);
  }

  // Render filtered transactions
  const ul = document.getElementById("tx-list");
  ul.innerHTML = "";

  if (filteredTx.length === 0) {
    ul.innerHTML = "<li class='no-transactions'>No transactions in the selected date range</li>";
    return;
  }

  // Apply current sort to filtered results
  switch (sortOrder) {
    case "date-desc":
      filteredTx.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "date-asc":
      filteredTx.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "amount-desc":
      filteredTx.sort((a, b) => b.amount - a.amount);
      break;
    case "amount-asc":
      filteredTx.sort((a, b) => a.amount - b.amount);
      break;
  }

  // Display filtered transactions
  filteredTx.forEach((tx) => {
    const li = document.createElement("li");
    li.setAttribute("data-account", tx.account);
    li.setAttribute("data-id", tx.id || "tx-" + Math.random().toString(36).substr(2, 9));

    if (tx.isPinned) {
      li.classList.add("pinned");
    }

    const recurringIcon = tx.isRecurring ?
      `<i class="fas fa-sync-alt recurring-icon" title="Recurring Transaction"></i>` : '';

    li.innerHTML = `
      <span>
        <i class="fas fa-${tx.type === "expense" ? "arrow-down" : "arrow-up"}"
           style="color: var(--${tx.type}-color);"></i>
        <span class="account-dot" style="background-color: var(--${tx.account}-color);"></span>
        ${tx.description || "(no desc)"}
        ${recurringIcon}
        ${tx.category ? `<span class="category-tag">${tx.category}</span>` : ''}
      </span>
      <span>${formatAmt(tx.amount)}</span>
    `;

    li.addEventListener("click", function() {
      const index = data.transactions.findIndex(t =>
        t.id === tx.id ||
        (t.date === tx.date && t.amount === tx.amount && t.description === tx.description &&
         t.type === tx.type && t.account === tx.account)
      );

      if (index !== -1) {
        currentTxIndex = index;
        openTransactionDetails(tx);
      }
    });

    ul.appendChild(li);
  });
}

// Switch between app views (transactions, charts, budgets)
function switchView(viewName) {
  // Hide all views
  document.getElementById('transactions-view').classList.add('hidden');
  document.getElementById('charts-view').classList.add('hidden');
  document.getElementById('budgets-view').classList.add('hidden');

  // Remove active class from all nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Show selected view and highlight nav item
  document.getElementById(`${viewName}-view`).classList.remove('hidden');
  document.querySelector(`.nav-item[data-view="${viewName}"]`).classList.add('active');

  // Update current view
  currentView = viewName;

  // If switching to charts view, update charts
  if (viewName === 'charts') {
    updateCharts();
    updateBalanceOverTimeChart();
  }

  // If switching to budgets view, render budgets
  if (viewName === 'budgets') {
    renderBudgets();
  }
}

// Render budgets
function renderBudgets() {
  const budgetContainer = document.getElementById('budget-items');
  budgetContainer.innerHTML = '';

  // Get all categories
  const categories = data.categories || [];

  // Get current month and year
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Filter transactions for current month
  const thisMonthTransactions = data.transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= monthStart && txDate <= monthEnd && tx.type === 'expense';
  });

  // Calculate spending by category
  const spendingByCategory = {};
  thisMonthTransactions.forEach(tx => {
    const category = tx.category || 'Other';
    spendingByCategory[category] = (spendingByCategory[category] || 0) + tx.amount;
  });

  // For each category, create a budget item
  categories.forEach(category => {
    if (category === 'Income') return; // Skip Income category for budgets

    const budgetItem = document.createElement('div');
    budgetItem.className = 'budget-item';

    // Get budget amount from data or default to 0
    const budgetAmount = (data.budgets && data.budgets[category]) || 0;
    // Get actual spending
    const actualSpending = spendingByCategory[category] || 0;
    // Calculate progress percentage (capped at 100%)
    const progressPercent = budgetAmount > 0 ? Math.min(Math.round((actualSpending / budgetAmount) * 100), 100) : 0;
    // Determine status color
    let statusColor = 'var(--accent)';
    if (progressPercent > 90) statusColor = 'var(--expense-color)';
    else if (progressPercent > 70) statusColor = 'orange';

    budgetItem.innerHTML = `
      <div class="budget-header">
        <h3>${category}</h3>
        <button class="set-budget-btn" data-category="${category}">
          <i class="fas fa-edit"></i>
        </button>
      </div>
      <div class="budget-details">
        <div class="budget-progress">
          <div class="progress-bar" style="width: ${progressPercent}%; background-color: ${statusColor};"></div>
        </div>
        <div class="budget-stats">
          <span>${formatAmt(actualSpending)} of ${formatAmt(budgetAmount)}</span>
          <span>${progressPercent}%</span>
        </div>
      </div>
    `;

    budgetContainer.appendChild(budgetItem);

    // Add event listener to edit budget button
    budgetItem.querySelector('.set-budget-btn').addEventListener('click', function() {
      const category = this.dataset.category;
      const currentBudget = (data.budgets && data.budgets[category]) || 0;
      const newBudget = prompt(`Set budget for ${category}:`, currentBudget);

      if (newBudget !== null) {
        // Parse and validate budget amount
        const budgetAmount = parseFloat(newBudget);
        if (!isNaN(budgetAmount) && budgetAmount >= 0) {
          // Initialize budgets object if it doesn't exist
          if (!data.budgets) data.budgets = {};
          // Set budget
          data.budgets[category] = budgetAmount;
          // Save data
          saveData();
          // Re-render budgets
          renderBudgets();
        } else {
          alert('Please enter a valid budget amount.');
        }
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();

  // Initialize views
  if (document.getElementById('charts-view')) {
    updateCharts();
  }

  if (document.getElementById('budgets-view')) {
    renderBudgets();
  }

  // Make total balance clickable to show all transactions
  document.querySelector(".total-balance").addEventListener("click", function() {
    filters.account = "all";
    filters.type = "all";
    document.getElementById("account-filter").value = "all";
    document.getElementById("type-filter").value = "all";
    document.getElementById("date-range-filter").value = "all";
    document.getElementById("search-input").value = "";
    updateActiveAccountCard();
    renderTransactions();
  });

  // Set up navigation between views
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
      switchView(this.dataset.view);
    });
  });

  // Initialize balance over time chart
  initBalanceOverTimeChart();

  // Initialize with transactions view
  switchView('transactions');

  // Search functionality
  document.getElementById("search-input").addEventListener("input", function() {
    searchTransactions(this.value);
  });

  // Date range filter
  document.getElementById("date-range-filter").addEventListener("change", function() {
    const value = this.value;
    const now = new Date();
    let startDate, endDate;

    switch(value) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        endDate = new Date(now);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case "custom":
        // Show custom date range inputs
        document.getElementById("custom-date-range").classList.remove("hidden");
        return;
      default:
        // All transactions (no date filter)
        filterByDateRange(null, null);
        document.getElementById("custom-date-range").classList.add("hidden");
        return;
    }

    document.getElementById("custom-date-range").classList.add("hidden");
    filterByDateRange(startDate, endDate);
  });

  // Custom date range inputs
  document.getElementById("custom-start-date").addEventListener("change", applyCustomDateRange);
  document.getElementById("custom-end-date").addEventListener("change", applyCustomDateRange);

  function applyCustomDateRange() {
    const startDate = document.getElementById("custom-start-date").value;
    const endDate = document.getElementById("custom-end-date").value;

    if (startDate && endDate) {
      filterByDateRange(startDate, endDate);
    }
  }

  // Pin/Unpin transaction
  document.getElementById("pin-tx-btn").addEventListener("click", function() {
    togglePinTransaction(currentTxIndex);
  });

  // Theme toggle
  document.getElementById("theme-toggle").addEventListener("click", function() {
    toggleTheme();
  });

  // Prevent pinch zoom
  document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) {
      event.preventDefault();
    }
  }, { passive: false });

  // Prevent double-tap zoom
  let lastTapTime = 0;
  document.addEventListener('touchend', function (event) {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;
    if (tapLength < 300 && tapLength > 0) {
      event.preventDefault();
    }
    lastTapTime = currentTime;
  });

  // Set viewport height variable for mobile browsers
  const setViewportHeight = () => {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  };
  window.addEventListener('resize', setViewportHeight);
  setViewportHeight();

  // Make sure transaction modal is hidden on page load
  document.getElementById("transaction-modal").classList.add("hidden");
  document.getElementById("edit-tx-modal").classList.add("hidden");

  // Add click event for close button
  document.getElementById("tx-close-btn").addEventListener("click", function(e) {
    e.stopPropagation();
    document.getElementById("transaction-modal").classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }
    // Restore scroll position when closing modal
    const scrollPos = parseInt(modal.dataset.scrollPosition || '0');
    setTimeout(() => window.scrollTo(0, scrollPos), 0);
  });

  // Close modal when clicking outside the content
  document.getElementById("transaction-modal").addEventListener("click", function(e) {
    if (e.target === this) {
      this.classList.add("hidden");
      document.body.classList.remove("modal-open");
      if (currentMap) {
        currentMap.remove();
        currentMap = null;
      }
      // Restore scroll position when closing modal
      const scrollPos = parseInt(this.dataset.scrollPosition || '0');
      setTimeout(() => window.scrollTo(0, scrollPos), 0);
    }
  });

  // Delete transaction button
  document.getElementById("delete-tx-btn").addEventListener("click", function() {
    deleteTransaction(currentTxIndex);
  });

  // Edit transaction button
  document.getElementById("edit-tx-btn").addEventListener("click", function() {
    openEditTransactionModal(currentTxIndex);
  });

  // Cancel edit button
  document.getElementById("edit-cancel-btn").addEventListener("click", function() {
    document.getElementById("edit-tx-modal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  });

  // Edit transaction form submission
  document.getElementById("edit-tx-form").addEventListener("submit", function(e) {
    e.preventDefault();
    saveEditedTransaction();
  });

  // Reset all data button
  document.getElementById("reset-btn").addEventListener("click", resetAllData);

  // Reset confirmation modal buttons
  document.getElementById("reset-confirm-btn").addEventListener("click", confirmReset);
  document.getElementById("reset-cancel-btn").addEventListener("click", function() {
    document.getElementById("reset-confirm-modal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  });
  document.getElementById("reset-cancel-close-btn").addEventListener("click", function() {
    document.getElementById("reset-confirm-modal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  });

  // Close reset modal when clicking outside content
  document.getElementById("reset-confirm-modal").addEventListener("click", function(e) {
    if (e.target === this) {
      this.classList.add("hidden");
      document.body.classList.remove("modal-open");
    }
  });

  // Filter and sort handlers
  document.getElementById("account-filter").addEventListener("change", function(e) {
    filters.account = e.target.value;
    updateActiveAccountCard();
    renderTransactions();
  });

  document.getElementById("type-filter").addEventListener("change", function(e) {
    filters.type = e.target.value;
    renderTransactions();
  });

  document.getElementById("sort-by").addEventListener("change", function(e) {
    sortOrder = e.target.value;
    renderTransactions();
  });

  // Account card filtering
  document.querySelectorAll(".card[data-account]").forEach(card => {
    card.addEventListener("click", function() {
      const account = this.dataset.account;
      if (filters.account === account) {
        // If already filtered to this account, reset filter
        filters.account = "all";
        document.getElementById("account-filter").value = "all";
      } else {
        // Set filter to this account
        filters.account = account;
        document.getElementById("account-filter").value = account;
      }
      updateActiveAccountCard();
      renderTransactions();
    });
  });

  // Helper to update active card styling
  function updateActiveAccountCard() {
    document.querySelectorAll(".card[data-account]").forEach(card => {
      if (filters.account === "all") {
        card.classList.remove("active");
      } else {
        card.classList.toggle("active", card.dataset.account === filters.account);
      }
    });
  }
});
