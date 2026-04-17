<?php
require 'C:/Users/Guillaume/Local Sites/olthem/app/public/wp-load.php';
$posts = get_posts([
  'post_type' => 'sections',
  'numberposts' => -1,
  'post_status' => 'publish'
]);
foreach ($posts as $p) {
  $slug = $p->post_name;
  if (stripos($slug, 'atelier') === false) continue;

  echo 'ID=' . $p->ID . '|SLUG=' . $slug . '|TITLE=' . $p->post_title . PHP_EOL;
  $builder = get_field('builder', $p->ID);
  if (!is_array($builder)) {
    echo "NO_BUILDER" . PHP_EOL;
    continue;
  }

  foreach ($builder as $ri => $row) {
    $rowType = $row['acf_fc_layout'] ?? '';
    echo 'ROW#' . $ri . ' TYPE=' . $rowType . PHP_EOL;

    $sub = $row['subsection'] ?? $row['subSection'] ?? $row['SubSection'] ?? null;
    if (is_array($sub)) {
      foreach ($sub as $li => $layout) {
        $type = $layout['acf_fc_layout'] ?? '';
        echo '  LAYOUT#' . $li . ' TYPE=' . $type . PHP_EOL;
        if (stripos($type, 'button') !== false || stripos($type, 'overlay') !== false) {
          echo '    KEYS=' . implode(',', array_keys($layout)) . PHP_EOL;
          foreach ($layout as $k => $v) {
            if ($k === 'acf_fc_layout') continue;
            if (is_scalar($v) || $v === null) {
              echo '    ' . $k . '=' . (string)$v . PHP_EOL;
            } elseif (is_array($v)) {
              echo '    ' . $k . '=[array keys:' . implode(',', array_keys($v)) . ']' . PHP_EOL;
            } else {
              echo '    ' . $k . '=[object]' . PHP_EOL;
            }
          }
        }
      }
    }

    if (stripos($rowType, 'button') !== false || stripos($rowType, 'overlay') !== false || stripos($rowType, 'double') !== false) {
      echo '  ROW_KEYS=' . implode(',', array_keys($row)) . PHP_EOL;
    }
  }
}
