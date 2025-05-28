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
function renderTransactions() {
  const ul = document.getElementById("tx-list");
  ul.innerHTML = "";
  data.transactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((tx) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>
          <i class="fas fa-${tx.type === "expense" ? "arrow-down" : "arrow-up"}"></i>
          ${tx.description || "(no desc)"}
        </span>
        <span>${formatAmt(tx.amount)}</span>
      `;
      li.addEventListener("click", function () {
        const index = data.transactions.findIndex(t => 
          t.date === tx.date && 
          t.amount === tx.amount && 
          t.description === tx.description && 
          t.type === tx.type
        );
        currentTxIndex = index;
        
        const modal = document.getElementById("transaction-modal");
        const info = document.getElementById("tx-info");
        const mapPreview = document.getElementById("map-preview");

        let detailsHtml =
          "<p><strong>Description:</strong> " +
          (tx.description || "(no desc)") +
          "</p>" +
          "<p><strong>Type:</strong> " +
          tx.type +
          "</p>" +
          "<p><strong>Amount:</strong> " +
          formatAmt(tx.amount) +
          "</p>" +
          "<p><strong>Date:</strong> " +
          tx.date +
          "</p>";
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
  
  // Make sure transaction modal is hidden on page load
  document.getElementById("transaction-modal").classList.add("hidden");
  
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
});
