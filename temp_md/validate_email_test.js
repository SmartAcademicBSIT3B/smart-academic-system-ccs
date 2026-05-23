function validateEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePayload(payload) {
  const errors = {};

  if (!payload.student_id) errors["ojt-student-id"] = "Student ID is required.";
  if (!payload.name) errors["ojt-name"] = "Name is required.";
  if (!payload.section) errors["ojt-section"] = "Section is required.";
  if (!payload.email) {
    errors["ojt-email"] = "Email is required to create a student account.";
  } else if (!validateEmail(payload.email)) {
    errors["ojt-email"] = "Please enter a valid email address.";
  } else if (
    !String(payload.email || "")
      .toLowerCase()
      .endsWith("@plpasig.edu.ph")
  ) {
    errors["ojt-email"] = "Email must be a @plpasig.edu.ph address.";
  }
  if (payload.contact_no && payload.contact_no.length < 7) {
    errors["ojt-contact-no"] = "Contact number is too short.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

console.log(
  "valid test1",
  validatePayload({
    student_id: "1",
    name: "a",
    section: "s",
    email: "user@plpasig.edu.ph",
  }),
);
console.log(
  "invalid test2",
  validatePayload({
    student_id: "1",
    name: "a",
    section: "s",
    email: "user@example.com",
  }),
);
console.log(
  "invalid test3",
  validatePayload({ student_id: "1", name: "a", section: "s", email: "" }),
);
