<?php
require 'C:/Users/Guillaume/Local Sites/olthem/app/public/wp-load.php';
global $wpdb;
$table = $wpdb->prefix . 'olthem_ateliers';
$columns = $wpdb->get_results("DESCRIBE {$table}", ARRAY_A);
if (!$columns) {
    echo 'NO_COLUMNS';
    exit;
}
foreach ($columns as $column) {
    echo ($column['Field'] ?? '') . PHP_EOL;
}
