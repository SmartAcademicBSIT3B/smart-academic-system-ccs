/**
 * Notification Service
 * Handles real-time notifications for coordinators
 */

// Store connected WebSocket clients per department
const connectedClients = new Map();

/**
 * Register a WebSocket client for a coordinator
 * @param {string} dept - Department code
 * @param {string} coordinatorEmail - Coordinator email
 * @param {WebSocket} ws - WebSocket connection
 */
function registerClient(dept, coordinatorEmail, ws) {
  if (!connectedClients.has(dept)) {
    connectedClients.set(dept, []);
  }
  const clients = connectedClients.get(dept);
  const clientRef = { email: coordinatorEmail, ws };
  clients.push(clientRef);
  console.log(
    `[Notifications] Registered coordinator ${coordinatorEmail} for ${dept}`,
  );
  return () => {
    const idx = clients.indexOf(clientRef);
    if (idx !== -1) clients.splice(idx, 1);
    console.log(
      `[Notifications] Unregistered coordinator ${coordinatorEmail} for ${dept}`,
    );
  };
}

/**
 * Broadcast a notification to all coordinators in a department
 * @param {string} dept - Department code
 * @param {object} notification - Notification object
 */
function broadcastNotification(dept, notification) {
  if (!connectedClients.has(dept)) return;

  const clients = connectedClients.get(dept);
  const message = JSON.stringify({
    type: "notification",
    data: notification,
  });

  clients.forEach(({ ws }) => {
    if (ws.readyState === 1) {
      // OPEN
      ws.send(message);
    }
  });
}

/**
 * Build a requirement notification
 * @param {number} ojtStudentId - Student OJT ID
 * @param {string} studentId - Student ID
 * @param {string} studentName - Student name
 * @param {string} section - Requirement section (pre/post)
 * @param {string} fileName - File name
 * @param {string} status - Requirement status
 */
async function buildRequirementNotification(
  ojtStudentId,
  studentId,
  studentName,
  section,
  fileName,
  status,
) {
  let message = "";
  if (status === "submitted" || status === "pending") {
    message = `submitted a ${section === "post" ? "post-" : "pre-"}requirement file`;
  } else if (status === "verified") {
    message = `${section === "post" ? "post-" : "pre-"}requirement was verified`;
  } else if (status === "rejected") {
    message = `${section === "post" ? "post-" : "pre-"}requirement was rejected`;
  } else {
    message = `updated a ${section === "post" ? "post-" : "pre-"}requirement`;
  }

  return {
    id: `req-${ojtStudentId}-${Date.now()}`,
    activity_type: "requirement",
    status: status,
    student_id: studentId,
    student_name: studentName,
    message: message,
    file_name: fileName || "(File)",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a weekly report notification
 * @param {number} ojtStudentId - Student OJT ID
 * @param {string} studentId - Student ID
 * @param {string} studentName - Student name
 * @param {number} weekNumber - Week number
 * @param {string} status - Report status
 * @param {boolean} hasFeedback - Whether feedback exists
 */
async function buildWeeklyReportNotification(
  ojtStudentId,
  studentId,
  studentName,
  weekNumber,
  status,
  hasFeedback = false,
) {
  let message = "";
  if (status === "submitted" || status === "pending") {
    message = `submitted week ${weekNumber} report`;
  } else if (status === "reviewed") {
    message = `week ${weekNumber} report was reviewed`;
  } else if (status === "returned") {
    message = `week ${weekNumber} report was returned for revision`;
  } else {
    message = `updated week ${weekNumber} report`;
  }

  return {
    id: `report-${ojtStudentId}-${weekNumber}-${Date.now()}`,
    activity_type: "weekly_report",
    status: status,
    student_id: studentId,
    student_name: studentName,
    message: message,
    week_number: weekNumber,
    has_feedback: hasFeedback,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Emit requirement upload notification
 * @param {string} dept - Department code
 * @param {number} ojtStudentId - Student OJT ID
 * @param {string} studentId - Student ID
 * @param {string} studentName - Student name
 * @param {string} section - Requirement section (pre/post)
 * @param {string} fileName - File name
 * @param {string} status - Requirement status
 */
async function emitRequirementUpload(
  dept,
  ojtStudentId,
  studentId,
  studentName,
  section,
  fileName,
  status,
) {
  const notification = await buildRequirementNotification(
    ojtStudentId,
    studentId,
    studentName,
    section,
    fileName,
    status,
  );

  broadcastNotification(dept, notification);
}

/**
 * Emit weekly report submission notification
 * @param {string} dept - Department code
 * @param {number} ojtStudentId - Student OJT ID
 * @param {string} studentId - Student ID
 * @param {string} studentName - Student name
 * @param {number} weekNumber - Week number
 * @param {string} status - Report status
 * @param {boolean} hasFeedback - Whether feedback exists
 */
async function emitWeeklyReportSubmission(
  dept,
  ojtStudentId,
  studentId,
  studentName,
  weekNumber,
  status,
  hasFeedback = false,
) {
  const notification = await buildWeeklyReportNotification(
    ojtStudentId,
    studentId,
    studentName,
    weekNumber,
    status,
    hasFeedback,
  );

  broadcastNotification(dept, notification);
}

module.exports = {
  registerClient,
  broadcastNotification,
  buildRequirementNotification,
  buildWeeklyReportNotification,
  emitRequirementUpload,
  emitWeeklyReportSubmission,
  connectedClients,
};
