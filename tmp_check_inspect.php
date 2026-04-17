<?php
require 'C:/Users/Guillaume/Local Sites/olthem/app/public/wp-load.php';
$pages = get_posts(['post_type'=>'page','numberposts'=>-1,'post_status'=>'publish','name'=>'creation-datelier']);
if(!$pages) { $pages = get_posts(['post_type'=>'page','numberposts'=>-1,'post_status'=>'publish','s'=>'atelier']); }
foreach($pages as $p){
  echo 'ID='.$p->ID.'|SLUG='.$p->post_name.'|TITLE='.$p->post_title.PHP_EOL;
  $b = get_field('formconstructor',$p->ID);
  if(!is_array($b)){echo "NO_FORMCONSTRUCTOR".PHP_EOL;continue;}
  foreach($b as $row){
    $key=$row['acf_fc_layout']??'';
    if($key==='formsettings'){
      echo 'FORM_PROCESS='.($row['form_process']??'').PHP_EOL;
      $checks=$row['form_check']??[];
      if(is_array($checks)){
        foreach($checks as $i=>$c){
          echo "CHECK[$i]=".json_encode($c).PHP_EOL;
        }
      }
    }
  }
}
