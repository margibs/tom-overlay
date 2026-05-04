  function onTownData(callback) {
    listeners.push(callback);
    if (townData) callback(townData);
  }

  function notifyListeners(data) {
    townData = data;
    listeners.forEach((cb) => cb(data));
  }

  // --- Fetch Intercept ---
  const originalFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";

    const response = await originalFetch.apply(this, [input, init]);

    if (/\/my\/town\/\d+(?:\?|$)/.test(url)) {
      // Town data — handled by notifyListeners → onTownData
      response
        .clone()
        .json()
        .then((json) => {
          if (json && json.tiles && json.populations) {
            // Tick interval from food production time
            const t = json.last_food_production_time;
            if (t) {
              const prev = window._tomLastFoodTime;
              if (prev && t !== prev) tickInterval = t - prev;
              window._tomLastFoodTime = t;
            }
            notifyListeners(json);
          }
        })
        .catch((e) => console.warn("[TOM]", e));
    }

    if (/\/buildings\/\d+\/trades/.test(url)) {
      response
        .clone()
        .json()
        .then((json) => {
          if (json && json.items && json.meta) {
            lastMarketTrades = json;
            renderAll();
          }
        })
        .catch((e) => console.warn("[TOM]", e));
    }

    return response;
  };

  // --- XHR Intercept (fallback) ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._tomUrl = url;
    this._tomMethod = method;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._tomUrl && /\/my\/town\/\d+(?:\?|$)/.test(this._tomUrl)) {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.tiles && json.populations) {
            const t = json.last_food_production_time;
            if (t) {
              const prev = window._tomLastFoodTime;
              if (prev && t !== prev) {
                tickInterval = t - prev;
              }
              window._tomLastFoodTime = t;
            }
            notifyListeners(json);
          }
        } catch (e) { console.warn("[TOM]", e); }
      });
    } else if (
      this._tomUrl &&
      /\/town-building-assignees/.test(this._tomUrl) &&
      (this._tomMethod || "").toUpperCase() === "POST"
    ) {
      let reqBody = null;
      try {
        reqBody = JSON.parse(args[0]);
      } catch (e) { console.warn("[TOM]", e); }
      if (reqBody) {
        this.addEventListener("load", function () {
          try {
            const json = JSON.parse(this.responseText);
            if (json && json.quantity !== undefined && lastParsed) {
              const bld = lastParsed.allBuildings.find(
                (b) => b.id == reqBody.building_id,
              );
              if (bld) bld.assignees = json.quantity;
              const pop = lastParsed.allPopulations.find(
                (p) => p.type === reqBody.population_type,
              );
              if (pop) pop.idle = Math.max(0, pop.idle - reqBody.quantity);
              rebuildDerived();
              renderAll();
            }
          } catch (e) { console.warn("[TOM]", e); }
        });
      }
    } else if (
      this._tomUrl &&
      /\/buildings\/\d+/.test(this._tomUrl) &&
      (this._tomMethod || "").toUpperCase() === "PATCH"
    ) {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.building_id && lastParsed) {
            const bld = lastParsed.allBuildings.find(
              (b) => b.id == json.building_id,
            );
            if (bld) bld.builders = 1;
            if (lastParsed.buildingMap[json.building_id]) {
              lastParsed.buildingMap[json.building_id].builders = 1;
            }
            rebuildDerived();
            renderAll();
          } else if (json && json.message) {
            const m = json.message.match(/(\d+)\/(\d+).*building_queue/);
            if (m) {
              buildingQueueMax = parseInt(m[2]);
              renderAll();
            }
          }
        } catch (e) { console.warn("[TOM]", e); }
      });
    } else if (
      this._tomUrl &&
      /\/buildings\/\d+\/trades/.test(this._tomUrl) &&
      (this._tomMethod || "").toUpperCase() === "GET"
    ) {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.items && json.meta) {
            lastMarketTrades = json;
            renderAll();
          }
        } catch (e) { console.warn("[TOM]", e); }
      });
    }
    return originalSend.apply(this, args);
  };
