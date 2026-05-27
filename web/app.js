const resultsEl = document.getElementById("results");
const detailEl = document.getElementById("detail");
const detailBodyEl = document.getElementById("detail-body");
const formEl = document.getElementById("search-form");
const inputEl = document.getElementById("search-input");
const topButtonEl = document.getElementById("top-button");

function metric(label, value) {
  return `<span>${label}: <strong>${value}</strong></span>`;
}

function momentumBadge(label) {
  if (!label || label === "Stable") return "";
  return `<span class="momentum momentum-${label.toLowerCase()}">${label}</span>`;
}

function renderResults(items) {
  if (!items.length) {
    resultsEl.innerHTML = "<p>没有结果。</p>";
    return;
  }
  resultsEl.innerHTML = items.map((item) => `
    <article class="result-card" data-name="${item.full_name}">
      <div class="result-top">
        <h3 class="name">${item.full_name}</h3>
        <div class="badges">
          <span class="rank">${item.rank_label}</span>
          ${momentumBadge(item.momentum_label)}
        </div>
      </div>
      <p class="desc">${item.description || "No description"}</p>
      <div class="metric-row">
        ${metric("Score", item.score.toFixed(2))}
        ${metric("30d +", item.score_growth_30d.toFixed(2))}
        ${metric("Dependents", item.dependent_count)}
        ${metric("Recent", item.recent_dependent_count)}
        ${metric("Downloads", item.download_count)}
        ${metric("Latest", item.latest_version || "-")}
      </div>
    </article>
  `).join("");

  for (const card of resultsEl.querySelectorAll(".result-card")) {
    card.addEventListener("click", () => showPackage(card.dataset.name));
  }
}

async function requestJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function search(term = "") {
  const query = new URLSearchParams();
  if (term) query.set("q", term);
  const data = await requestJson(`/api/search?${query.toString()}`);
  renderResults(data.items);
}

function renderDependents(items) {
  if (!items.length) {
    return "<p>当前没有解析到反向依赖。</p>";
  }
  return `
    <div class="dependents">
      ${items.map((item) => `
        <div class="dependent">
          <strong>${item.full_name}</strong>
          <div>${item.description || "No description"}</div>
          <div>Score ${item.score.toFixed(2)} / Rank ${item.rank_label}${item.momentum_label && item.momentum_label !== "Stable" ? ` / ${item.momentum_label}` : ""}</div>
        </div>
      `).join("")}
    </div>
  `;
}

async function showPackage(fullName) {
  const pkg = await requestJson(`/api/packages/${encodeURIComponent(fullName)}`);
  const dependents = await requestJson(`/api/packages/${encodeURIComponent(fullName)}/dependents`);
  detailEl.classList.remove("empty");
  detailBodyEl.innerHTML = `
    <div class="detail-grid">
      <div><strong>${pkg.full_name}</strong></div>
      <div>${pkg.description || "No description"}</div>
      <div>${metric("Score", pkg.score.toFixed(2))} ${metric("30d Ago", pkg.score_30d_ago.toFixed(2))} ${metric("30d Growth", pkg.score_growth_30d.toFixed(2))}</div>
      <div>${metric("Rank", pkg.rank_label)} ${metric("Momentum", pkg.momentum_label)} ${metric("Latest", pkg.latest_version || "-")}</div>
      <div>${metric("Dependents", pkg.dependent_count)} ${metric("Recent", pkg.recent_dependent_count)} ${metric("Downloads", pkg.download_count)}</div>
      <div>${metric("Repository", pkg.repository || "-")} ${metric("License", pkg.license || "-")}</div>
      <div>
        <strong>Keywords</strong>
        <div class="pill-list">
          ${(pkg.keywords || []).map((keyword) => `<span class="pill">${keyword}</span>`).join("") || "<span class='pill'>None</span>"}
        </div>
      </div>
      <div>
        <strong>Recent Versions</strong>
        <div class="pill-list">
          ${pkg.versions.map((version) => `<span class="pill">${version.version}</span>`).join("")}
        </div>
      </div>
      <div>
        <strong>Dependents</strong>
        ${renderDependents(dependents.items)}
      </div>
    </div>
  `;
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  search(inputEl.value.trim()).catch((error) => {
    resultsEl.innerHTML = `<p>${error.message}</p>`;
  });
});

topButtonEl.addEventListener("click", () => {
  search("").catch((error) => {
    resultsEl.innerHTML = `<p>${error.message}</p>`;
  });
});

search("").catch((error) => {
  resultsEl.innerHTML = `<p>${error.message}</p>`;
});
