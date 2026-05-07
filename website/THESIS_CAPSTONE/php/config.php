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

return $conn;
