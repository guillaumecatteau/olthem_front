<?php
require 'C:/Users/Guillaume/Local Sites/olthem/app/public/wp-load.php';
$posts = get_posts([
  'post_type' => 'olthem_thematique',
  'numberposts' => -1,
  'post_status' => 'publish'
]);
foreach ($posts as $p) {
  $t = get_field('titre', $p->ID);
  $postTitle = $p->post_title;
  if (stripos((string)$t, 'Propagande') === false && stripos((string)$postTitle, 'Propagande') === false) {
    continue;
  }

  echo 'ID=' . $p->ID . '|TITRE=' . $t . PHP_EOL;
  $builder = get_field('builder', $p->ID);
  if (!is_array($builder)) {
    echo "NO_BUILDER" . PHP_EOL;
    continue;
  }

  foreach ($builder as $row) {
    $layouts = $row['subsection'] ?? [];
    foreach ($layouts as $l) {
      $type = $l['acf_fc_layout'] ?? '';
      if ($type === 'subsectiontitle') {
        echo 'SUBSECTION=' . ($l['title'] ?? '') . PHP_EOL;
      }
      if ($type === 'paragraphetitle') {
        echo 'PARA=' . ($l['paragraphename'] ?? '') . PHP_EOL;
      }
      if ($type === 'videosolo') {
        echo 'VIDEO_LINK=' . ($l['videolink'] ?? '') . PHP_EOL;
        echo 'VIDEO_TITLE=' . ($l['videotitle'] ?? '') . PHP_EOL;
      }
    }
  }
}
