// ---------- Data layer ----------
const STORAGE_KEY = "money-manager-data";
let currentMap = null;
let modalInitialized = false;
let currentTxIndex = -1;
let data = {
  balances: { cu: 0, revolut: 0, cash: 0 },
  transactions: [],
};

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) data = JSON.parse(saved);
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
  
  filteredTransactions.forEach((tx) => {
    const li = document.createElement("li");
    li.setAttribute("data-account", tx.account);
    li.innerHTML = `
      <span>
        <i class="fas fa-${tx.type === "expense" ? "arrow-down" : "arrow-up"}" 
           style="color: var(--${tx.type}-color);"></i>
        <span class="account-dot" style="background-color: var(--${tx.account}-color);"></span>
        ${tx.description || "(no desc)"}
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
                        "<p><strong>Date:</strong> " + tx.date + "</p>";
      info.innerHTML = detailsHtml;
      
      // Clear previous map
      mapPreview.innerHTML = "";
      if (currentMap) {
          currentMap.remove();
          currentMap = null;
      }
      
      modal.classList.remove("hidden");
      
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

  let transaction = { amount: amt, account: acc, type, description: desc, date };

  const addTransaction = (location) => {
    if (location) {
      transaction.location = location;
    }
    data.transactions.push(transaction);
    data.balances[acc] += type === "expense" ? -amt : amt;
    saveData();
    renderBalances();
    renderTransactions();
    renderTotalBalance();
    modal.classList.add("hidden");
    e.target.reset();
  };

  // Request geolocation if available
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (position) {
        addTransaction({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      function (error) {
        console.log("Location error or permission denied:", error);
        addTransaction(null);
      },
    );
  } else {
    addTransaction(null);
  }
});

// Delete a transaction
function deleteTransaction(index) {
  if (index < 0 || index >= data.transactions.length) return;
  
  const tx = data.transactions[index];
  // Reverse the effect on balance
  data.balances[tx.account] -= tx.type === "expense" ? -tx.amount : tx.amount;
  
  // Remove the transaction
  data.transactions.splice(index, 1);
  
  // Save and update UI
  saveData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();
  
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
  
  // Hide transaction modal and show edit modal
  document.getElementById("transaction-modal").classList.add("hidden");
  document.getElementById("edit-tx-modal").classList.remove("hidden");
  
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
  
  // First, reverse the effect of the original transaction on the balance
  data.balances[oldTx.account] -= oldTx.type === "expense" ? -oldTx.amount : oldTx.amount;
  
  // Then, apply the effect of the new transaction values
  data.balances[newAccount] += newType === "expense" ? -newAmount : newAmount;
  
  // Update the transaction object
  const updatedTx = {
    amount: newAmount,
    account: newAccount,
    type: newType,
    description: newDesc,
    date: newDate,
    location: oldTx.location // Preserve original location data
  };
  
  // Replace the transaction in the array
  data.transactions[currentTxIndex] = updatedTx;
  
  // Save and update UI
  saveData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();
  
  // Hide edit modal
  document.getElementById("edit-tx-modal").classList.add("hidden");
}

// Reset all data
function resetAllData() {
  // Show custom confirmation modal instead of browser confirm
  document.getElementById("reset-confirm-modal").classList.remove("hidden");
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

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  renderBalances();
  renderTransactions();
  renderTotalBalance();
  
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
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }
  });
  
  // Close modal when clicking outside the content
  document.getElementById("transaction-modal").addEventListener("click", function(e) {
    if (e.target === this) {
      this.classList.add("hidden");
      if (currentMap) {
        currentMap.remove();
        currentMap = null;
      }
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
  });
  document.getElementById("reset-cancel-close-btn").addEventListener("click", function() {
    document.getElementById("reset-confirm-modal").classList.add("hidden");
  });
  
  // Close reset modal when clicking outside content
  document.getElementById("reset-confirm-modal").addEventListener("click", function(e) {
    if (e.target === this) {
      this.classList.add("hidden");
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
