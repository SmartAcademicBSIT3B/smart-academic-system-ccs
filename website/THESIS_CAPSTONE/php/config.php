<?php
$host = "mysql-eac28ff-smartacademicbsit3b-fb16.b.aivencloud.com";
$port = 25442;
$user = "avnadmin";
$pass = "AVNS__-yJEBgGhuiklEhCWdS";
$dbname = "CTAPLP";

$conn = new mysqli($host, $user, $pass, $dbname, $port);

if ($conn->connect_error) {

    // IMPORTANT: do NOT output JSON here.
    // Just stop quietly so that the calling script controls the output.

    error_log("DB Connection Failed: " . $conn->connect_error);
    
    // Let the parent script send JSON error instead
    return false;
}

/**
 * Get required OJT hours based on student's section and department.
 *
 * @param mysqli $conn Database connection
 * @param int $ojt_student_id OJT student ID (internal numeric ID from ojt_students.id)
 * @return int Required hours (defaults to 480 if not found)
 */
if (!function_exists('getStudentRequiredHours')) {
function getStudentRequiredHours($conn, $ojt_student_id) {
    if (!$conn || !$ojt_student_id) {
        return 480; // Safe default fallback
    }
    
    try {
        // Fetch student's section and department
        $stmt = $conn->prepare("SELECT section, department FROM ojt_students WHERE id = ? LIMIT 1");
        if (!$stmt) {
            return 480;
        }
        
        $stmt->bind_param("i", $ojt_student_id);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            $stmt->close();
            return 480;
        }
        
        $row = $result->fetch_assoc();
        $section = $row['section'] ?? 'CCS';
        $department = $row['department'] ?? 'CCS';
        $stmt->close();
        
        // Extract section prefix (e.g., "BSIT" from "BSIT3B")
        $section_prefix = strtoupper(preg_replace('/[^A-Za-z]/', '', substr($section, 0, 6)));
        
        // Look up required hours in ojt_department_hours table
        $lookupStmt = $conn->prepare(
            "SELECT required_hours FROM ojt_department_hours 
             WHERE department = ? AND section_prefix = ? LIMIT 1"
        );
        
        if (!$lookupStmt) {
            return 480;
        }
        
        $lookupStmt->bind_param("ss", $department, $section_prefix);
        $lookupStmt->execute();
        $lookupResult = $lookupStmt->get_result();
        
        if ($lookupResult->num_rows > 0) {
            $lookupRow = $lookupResult->fetch_assoc();
            $lookupStmt->close();
            return (int)($lookupRow['required_hours'] ?? 480);
        }
        
        $lookupStmt->close();
        
        // Fallback to default 480 hours if no match found
        return 480;
        
    } catch (Exception $e) {
        error_log("getStudentRequiredHours error: " . $e->getMessage());
        return 480;
    }
}
}

/**
 * Calculate student's OJT progress based on attendance records.
 *
 * @param mysqli $conn Database connection
 * @param string $student_id Student ID (e.g., "2023-00123")
 * @param int $required_hours Total required hours (e.g., 468, 156, 480)
 * @return array Array with keys: completed_hours, progress_percent, remaining_hours
 */
if (!function_exists('calculateStudentProgress')) {
function calculateStudentProgress($conn, $student_id, $required_hours) {
    if (!$conn || !$student_id || !$required_hours) {
        return [
            'completed_hours' => 0,
            'progress_percent' => 0,
            'remaining_hours' => $required_hours
        ];
    }
    
    try {
        // Sum all duration_minutes from ojt_attendance for this student
        $stmt = $conn->prepare(
            "SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes 
             FROM ojt_attendance 
             WHERE student_id_ref = ? AND status IN ('present', 'late', 'half-day')"
        );
        
        if (!$stmt) {
            return [
                'completed_hours' => 0,
                'progress_percent' => 0,
                'remaining_hours' => $required_hours
            ];
        }
        
        $stmt->bind_param("s", $student_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        
        // Convert minutes to hours (rounded down to be conservative)
        $total_minutes = (int)($row['total_minutes'] ?? 0);
        $completed_hours = (int)floor($total_minutes / 60);
        
        // Calculate percentage and remaining hours
        $progress_percent = min(100, (int)(($completed_hours / $required_hours) * 100));
        $remaining_hours = max(0, $required_hours - $completed_hours);
        
        return [
            'completed_hours' => $completed_hours,
            'progress_percent' => $progress_percent,
            'remaining_hours' => $remaining_hours
        ];
        
    } catch (Exception $e) {
        error_log("calculateStudentProgress error: " . $e->getMessage());
        return [
            'completed_hours' => 0,
            'progress_percent' => 0,
            'remaining_hours' => $required_hours
        ];
    }
}
}

return $conn;
