(function initializeCoordinatorDashboard() {
  const chartInstances = {};
  const chartStatusIds = [
    "barChart",
    "smallBarChart",
    "pieChart1",
    "pieChart2",
    "pieChart3",
  ];
  const unresolvedRequirementStatuses = new Set([
    "",
    "pending",
    "submitted",
    "rejected",
  ]);
  let cardNavigationBound = false;

  document.addEventListener("DOMContentLoaded", loadDashboard);

  async function loadDashboard() {
    const api = getApi();
    attachCardNavigation();

    setDashboardMessage("Loading dashboard data...");
    setCardValue("card-total-students", "--");
    setCardValue("card-undeployed-students", "--");
    setCardValue("card-currently-deployed", "--");
    setCardValue("card-active-partners", "--");
    setCardValue("card-pending-requirements", "--");
    chartStatusIds.forEach((chartId) => {
      setChartStatus(chartId, "Loading chart...");
    });

    try {
      assertDashboardApi(api);

      const [sectionResult, externalPartnerResult] = await Promise.all([
        api.getCoordinatorSections(),
        api.getExternalPartners(),
      ]);
      if (!sectionResult?.success) {
        throw new Error(
          sectionResult?.message || "Failed to load assigned sections.",
        );
      }
      if (!externalPartnerResult?.success) {
        throw new Error(
          externalPartnerResult?.message || "Failed to load external partners.",
        );
      }

      const sections = Array.isArray(sectionResult.sections)
        ? sectionResult.sections
        : [];
      const externalPartners = Array.isArray(externalPartnerResult.partners)
        ? externalPartnerResult.partners
        : [];
      if (!sections.length) {
        renderEmptyDashboard("No sections assigned to you yet.");
        return;
      }

      const students = await loadStudents(api, sections);
      const [pendingRequirementMap, capstoneApprovalMap] = await Promise.all([
        loadPendingRequirements(api, students),
        loadCapstoneApprovals(api, students),
      ]);

      const metrics = buildMetrics({
        sections,
        students,
        externalPartners,
        pendingRequirementMap,
        capstoneApprovalMap,
      });

      renderDashboard(metrics);
      setDashboardMessage(
        `Showing live data for ${sections.length} assigned section${sections.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      renderErrorDashboard(error);
    }
  }

  async function loadStudents(api, sections) {
    const studentResponses = await Promise.all(
      sections.map(async (section) => {
        const result = await api.getCoordinatorSectionStudents(
          section.section_name,
        );
        if (!result?.success) {
          throw new Error(
            result?.message ||
              `Failed to load students for ${section.section_name}.`,
          );
        }
        return Array.isArray(result.students)
          ? result.students.map((student) => ({
              ...student,
              section:
                String(student.section || "").trim() ||
                String(section.section_name || "").trim(),
            }))
          : [];
      }),
    );

    return studentResponses.flat();
  }

  async function loadPendingRequirements(api, students) {
    const entries = await Promise.all(
      students.map(async (student) => {
        const studentId = getStudentId(student);
        if (!studentId) return [studentId, false];

        const result = await api.getStudentRequirements({
          studentId,
          type: "pre",
        });

        if (!result?.success) {
          throw new Error(
            result?.message ||
              `Failed to load pre-requirements for ${studentId}.`,
          );
        }

        const requirements = Array.isArray(result.requirements)
          ? result.requirements
          : [];
        const hasPendingRequirement = requirements.some((requirement) => {
          const template = requirement?.template || {};
          const submission = requirement?.submission || null;
          const isRequired =
            Number(template.is_required) === 1 || template.is_required === true;
          if (!isRequired) return false;

          const status = String(submission?.status || "")
            .trim()
            .toLowerCase();
          return unresolvedRequirementStatuses.has(status);
        });

        return [studentId, hasPendingRequirement];
      }),
    );

    return new Map(entries);
  }

  async function loadCapstoneApprovals(api, students) {
    const entries = await Promise.all(
      students.map(async (student) => {
        const studentId = getStudentId(student);
        if (!studentId) return [studentId, false];

        const result = await api.getCoordinatorCapstoneApproval(studentId);
        if (!result?.success) return [studentId, false];
        return [studentId, Boolean(result.isApproved)];
      }),
    );

    return new Map(entries);
  }

  function buildMetrics({
    sections,
    students,
    externalPartners,
    pendingRequirementMap,
    capstoneApprovalMap,
  }) {
    const normalizedStudents = students.map((student) => {
      const studentId = getStudentId(student);
      const status = normalizeStatus(student.status);
      const sectionName = String(student.section || "").trim() || "Unassigned";
      const companyType =
        normalizeText(student.nature_of_business) || "Unspecified";

      return {
        studentId,
        status,
        sectionName,
        companyType,
      };
    });

    const totalStudents = normalizedStudents.length;
    const currentlyDeployed = normalizedStudents.filter(
      (student) => student.status === "Deployed",
    ).length;
    const undeployedStudents = normalizedStudents.filter(
      (student) =>
        student.status !== "Deployed" && student.status !== "OJT Complete",
    ).length;
    const activePartners = externalPartners.length;
    const pendingRequirements = normalizedStudents.filter((student) =>
      pendingRequirementMap.get(student.studentId),
    ).length;

    const deployedPerSection = sections.map((section) => {
      const label = String(section.section_name || "").trim() || "Unassigned";
      const value = normalizedStudents.filter(
        (student) =>
          student.sectionName === label && student.status === "Deployed",
      ).length;
      return { label, value };
    });

    const companyTypeCounts = toSortedEntries(
      normalizedStudents.reduce((counts, student) => {
        if (student.status !== "Deployed") return counts;
        counts[student.companyType] = (counts[student.companyType] || 0) + 1;
        return counts;
      }, {}),
    );

    const capstoneCompleted = normalizedStudents.filter((student) =>
      capstoneApprovalMap.get(student.studentId),
    ).length;
    const capstonePending = Math.max(totalStudents - capstoneCompleted, 0);

    const populationPerSection = sections.map((section) => ({
      label: String(section.section_name || "").trim() || "Unassigned",
      value: Number(section.student_count) || 0,
    }));

    const deploymentStatusEntries = toSortedEntries(
      normalizedStudents.reduce((counts, student) => {
        const statusLabel = student.status || "Unknown";
        counts[statusLabel] = (counts[statusLabel] || 0) + 1;
        return counts;
      }, {}),
    );

    return {
      cards: {
        totalStudents,
        undeployedStudents,
        currentlyDeployed,
        activePartners,
        pendingRequirements,
      },
      charts: {
        deployedPerSection,
        companyTypeCounts,
        capstoneCompletion: [
          { label: "Approved", value: capstoneCompleted },
          { label: "Not Yet Approved", value: capstonePending },
        ],
        populationPerSection,
        deploymentStatusEntries,
      },
    };
  }

  function renderDashboard(metrics) {
    setCardValue("card-total-students", metrics.cards.totalStudents);
    setCardValue("card-undeployed-students", metrics.cards.undeployedStudents);
    setCardValue("card-currently-deployed", metrics.cards.currentlyDeployed);
    setCardValue("card-active-partners", metrics.cards.activePartners);
    setCardValue(
      "card-pending-requirements",
      metrics.cards.pendingRequirements,
    );

    renderCartesianChart({
      chartId: "barChart",
      type: "bar",
      label: "Deployed Students",
      entries: metrics.charts.deployedPerSection,
      colors: ["rgba(157, 198, 255, 0.85)"],
      hideLegend: true,
    });

    renderCartesianChart({
      chartId: "smallBarChart",
      type: "bar",
      label: "Students",
      entries: metrics.charts.companyTypeCounts,
      colors: [
        "rgba(157, 198, 255, 0.85)",
        "rgba(120, 170, 238, 0.85)",
        "rgba(95, 149, 227, 0.85)",
        "rgba(75, 126, 205, 0.85)",
        "rgba(58, 110, 184, 0.85)",
      ],
      hideLegend: true,
    });

    renderCircularChart({
      chartId: "pieChart1",
      type: "doughnut",
      entries: metrics.charts.capstoneCompletion,
      colors: ["#6BD39A", "#E98F8F"],
    });

    renderCircularChart({
      chartId: "pieChart2",
      type: "pie",
      entries: metrics.charts.populationPerSection,
      colors: ["#9DC6FF", "#7EAEF3", "#5D95E3", "#4A7CC8", "#315E94"],
    });

    renderCircularChart({
      chartId: "pieChart3",
      type: "doughnut",
      entries: metrics.charts.deploymentStatusEntries,
      colors: ["#6BD39A", "#9DC6FF", "#E98F8F", "#F2B366", "#7C8BA1"],
    });
  }

  function attachCardNavigation() {
    if (cardNavigationBound) return;

    document.querySelectorAll(".card-click-target").forEach((target) => {
      const destination = String(target.dataset.navTarget || "").trim();
      if (!destination) return;

      const go = () => {
        window.location.href = destination;
      };

      target.addEventListener("click", go);
      target.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        go();
      });
    });

    cardNavigationBound = true;
  }

  function renderEmptyDashboard(message) {
    const zeroMetrics = {
      cards: {
        totalStudents: 0,
        undeployedStudents: 0,
        currentlyDeployed: 0,
        activePartners: 0,
        pendingRequirements: 0,
      },
      charts: {
        deployedPerSection: [],
        companyTypeCounts: [],
        capstoneCompletion: [],
        populationPerSection: [],
        deploymentStatusEntries: [],
      },
    };

    renderDashboard(zeroMetrics);
    chartStatusIds.forEach((chartId) => {
      setChartStatus(chartId, message);
      destroyChart(chartId);
    });
    setDashboardMessage(message);
  }

  function renderErrorDashboard(error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to load dashboard data.";
    setDashboardMessage(errorMessage, true);
    chartStatusIds.forEach((chartId) => {
      setChartStatus(chartId, errorMessage);
      destroyChart(chartId);
    });
  }

  function renderCartesianChart({
    chartId,
    type,
    label,
    entries,
    colors,
    hideLegend,
  }) {
    const chartElement = document.getElementById(chartId);
    if (!chartElement || typeof Chart === "undefined") {
      setChartStatus(chartId, "Chart library is unavailable.");
      return;
    }

    if (!entries.length) {
      destroyChart(chartId);
      setChartStatus(chartId, "No data available.");
      return;
    }

    const labels = entries.map((entry) => entry.label);
    const values = entries.map((entry) => entry.value);
    destroyChart(chartId);

    chartInstances[chartId] = new Chart(chartElement, {
      type,
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            backgroundColor: buildColorPalette(values.length, colors),
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: !hideLegend,
            labels: { color: "#C9CCD1" },
          },
        },
        scales: {
          x: {
            ticks: { color: "#9AA0A6" },
            grid: { color: "rgba(58, 63, 70, 0.45)" },
          },
          y: {
            beginAtZero: true,
            ticks: { color: "#9AA0A6", precision: 0 },
            grid: { color: "rgba(58, 63, 70, 0.45)" },
          },
        },
      },
    });

    setChartStatus(chartId, "", true);
  }

  function renderCircularChart({ chartId, type, entries, colors }) {
    const chartElement = document.getElementById(chartId);
    if (!chartElement || typeof Chart === "undefined") {
      setChartStatus(chartId, "Chart library is unavailable.");
      return;
    }

    const filteredEntries = entries.filter((entry) => entry.value > 0);
    if (!filteredEntries.length) {
      destroyChart(chartId);
      setChartStatus(chartId, "No data available.");
      return;
    }

    destroyChart(chartId);
    chartInstances[chartId] = new Chart(chartElement, {
      type,
      data: {
        labels: filteredEntries.map((entry) => entry.label),
        datasets: [
          {
            data: filteredEntries.map((entry) => entry.value),
            backgroundColor: buildColorPalette(filteredEntries.length, colors),
            borderColor: "#181C22",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#C9CCD1" },
          },
        },
      },
    });

    setChartStatus(chartId, "", true);
  }

  function destroyChart(chartId) {
    if (chartInstances[chartId]) {
      chartInstances[chartId].destroy();
      delete chartInstances[chartId];
    }
  }

  function setCardValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  }

  function setDashboardMessage(message, isError) {
    const element = document.getElementById("dashboardMessage");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
  }

  function setChartStatus(chartId, message, hide) {
    const element = document.getElementById(`status-${chartId}`);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-hidden", Boolean(hide));
  }

  function buildColorPalette(size, colors) {
    return Array.from(
      { length: size },
      (_, index) => colors[index % colors.length],
    );
  }

  function toSortedEntries(counts) {
    return Object.entries(counts)
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0]);
      })
      .map(([label, value]) => ({ label, value }));
  }

  function normalizeStatus(status) {
    const normalized = String(status || "")
      .trim()
      .toLowerCase();
    if (!normalized) return "Unknown";
    if (normalized === "ojt complete") return "OJT Complete";
    return normalized
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function getStudentId(student) {
    return String(student?.student_id || student?.studentId || "").trim();
  }

  function assertDashboardApi(api) {
    const requiredMethods = [
      "getCoordinatorSections",
      "getCoordinatorSectionStudents",
      "getExternalPartners",
      "getStudentRequirements",
      "getCoordinatorCapstoneApproval",
    ];

    const missingMethod = requiredMethods.find(
      (methodName) => typeof api?.[methodName] !== "function",
    );

    if (missingMethod) {
      throw new Error(`Dashboard API is unavailable: ${missingMethod}`);
    }
  }

  function getApi() {
    if (window.electronAPI) return window.electronAPI;
    try {
      if (
        window.parent &&
        window.parent !== window &&
        window.parent.electronAPI
      ) {
        return window.parent.electronAPI;
      }
    } catch (_) {}
    try {
      if (window.top && window.top !== window && window.top.electronAPI) {
        return window.top.electronAPI;
      }
    } catch (_) {}
    return {};
  }
})();
