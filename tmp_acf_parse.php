<?php
/**
 * Parse ACF field groups from the local.sql dump.
 * We read from the SQL INSERT statements for wp_posts
 * and reconstruct the tree.
 */

$sqlFile = 'C:/Users/Guillaume/Local Sites/olthem/app/sql/local.sql';
$lines   = file($sqlFile, FILE_IGNORE_NEW_LINES);

$posts = [];

foreach ($lines as $line) {
    // Match INSERT INTO `wp_posts` VALUES (...)
    if (preg_match('/^INSERT INTO `wp_posts` VALUES \((.+)\);$/s', $line, $m)) {
        $raw = $m[1];
        // Parse the CSV-like values — split carefully
        // Format: ID, author, date, date_gmt, post_content, post_title, post_excerpt, ...
        // Fields: ID(0), post_author(1), post_date(2), post_date_gmt(3), post_content(4),
        //         post_title(5), post_excerpt(6), post_status(7), comment_status(8),
        //         ping_status(9), post_password(10), post_name(11), to_ping(12),
        //         pinged(13), post_modified(14), post_modified_gmt(15), post_content_filtered(16),
        //         post_parent(17), guid(18), menu_order(19), post_type(20), post_mime_type(21),
        //         comment_count(22)

        // Use a state machine to parse MySQL values
        $values = parseMySQLValues($raw);
        if ($values === false || count($values) < 23) continue;

        $id          = (int)$values[0];
        $content     = $values[4];
        $title       = $values[5];
        $excerpt     = $values[6];
        $status      = $values[7];
        $post_name   = $values[11];
        $parent      = (int)$values[17];
        $menu_order  = (int)$values[19];
        $post_type   = $values[20];

        if ($post_type === 'acf-field-group' || $post_type === 'acf-field') {
            $posts[$id] = [
                'ID'         => $id,
                'title'      => $title,
                'name'       => $post_name,   // ACF key
                'excerpt'    => $excerpt,      // ACF field name
                'status'     => $status,
                'parent'     => $parent,
                'menu_order' => $menu_order,
                'post_type'  => $post_type,
                'content'    => $content,      // Serialized config
            ];
        }
    }
}

function parseMySQLValues($raw) {
    $values = [];
    $i = 0;
    $len = strlen($raw);
    
    while ($i < $len) {
        // Skip whitespace
        while ($i < $len && $raw[$i] === ' ') $i++;
        
        if ($i >= $len) break;
        
        if ($raw[$i] === '\'') {
            // Quoted string
            $i++; // skip opening quote
            $val = '';
            while ($i < $len) {
                if ($raw[$i] === '\\' && $i + 1 < $len) {
                    $val .= $raw[$i] . $raw[$i + 1];
                    $i += 2;
                } elseif ($raw[$i] === '\'') {
                    $i++; // skip closing quote
                    break;
                } else {
                    $val .= $raw[$i];
                    $i++;
                }
            }
            // Unescape
            $val = str_replace(['\\\'', '\\"', '\\\\', '\\n', '\\r', '\\t'], ["'", '"', '\\', "\n", "\r", "\t"], $val);
            $values[] = $val;
        } else {
            // Unquoted (number or NULL)
            $val = '';
            while ($i < $len && $raw[$i] !== ',') {
                $val .= $raw[$i];
                $i++;
            }
            $values[] = trim($val);
        }
        
        // Skip comma
        if ($i < $len && $raw[$i] === ',') $i++;
    }
    
    return $values;
}

// Build tree
$groups = [];
$fieldsByParent = [];

foreach ($posts as $p) {
    if ($p['post_type'] === 'acf-field-group') {
        $groups[$p['ID']] = $p;
    } else {
        $fieldsByParent[$p['parent']][] = $p;
    }
}

// Sort children by menu_order
foreach ($fieldsByParent as &$children) {
    usort($children, fn($a, $b) => $a['menu_order'] - $b['menu_order']);
}

function printField($field, $indent, $fieldsByParent) {
    $config = @unserialize($field['content']);
    $type   = is_array($config) ? ($config['type'] ?? '?') : '?';
    
    echo "{$indent}FIELD: name=\"{$field['excerpt']}\" | key={$field['name']} | label=\"{$field['title']}\" | type={$type}\n";
    
    // Show choices
    if (is_array($config) && !empty($config['choices'])) {
        $choices = [];
        foreach ($config['choices'] as $k => $v) $choices[] = "{$k}={$v}";
        echo "{$indent}  choices: " . implode(', ', $choices) . "\n";
    }
    
    // Show flexible_content layouts  
    if ($type === 'flexible_content' && is_array($config) && !empty($config['layouts'])) {
        foreach ($config['layouts'] as $lk => $lv) {
            echo "{$indent}  LAYOUT: key={$lk} | name=" . ($lv['name'] ?? '') . " | label=" . ($lv['label'] ?? '') . "\n";
            // Sub_fields stored inline in the layout
            if (!empty($lv['sub_fields'])) {
                foreach ($lv['sub_fields'] as $sf) {
                    echo "{$indent}    INLINE_SUB: name=" . ($sf['name'] ?? '') . " | type=" . ($sf['type'] ?? '') . " | label=" . ($sf['label'] ?? '') . "\n";
                }
            }
        }
    }
    
    // Show repeater sub_fields stored inline
    if ($type === 'repeater' && is_array($config) && !empty($config['sub_fields'])) {
        foreach ($config['sub_fields'] as $sf) {
            echo "{$indent}  INLINE_SUB: name=" . ($sf['name'] ?? '') . " | type=" . ($sf['type'] ?? '') . " | label=" . ($sf['label'] ?? '') . "\n";
        }
    }
    
    // Default value
    if (is_array($config) && isset($config['default_value']) && $config['default_value'] !== '' && $config['default_value'] !== 0) {
        $dv = is_array($config['default_value']) ? json_encode($config['default_value']) : $config['default_value'];
        echo "{$indent}  default: {$dv}\n";
    }
    
    // Recurse into child fields (ACF stores sub-fields as child posts)
    if (!empty($fieldsByParent[$field['ID']])) {
        foreach ($fieldsByParent[$field['ID']] as $child) {
            printField($child, $indent . '  ', $fieldsByParent);
        }
    }
}

echo "=== ACF FIELD GROUPS ===\n\n";
foreach ($groups as $g) {
    echo "GROUP: \"{$g['title']}\" | key={$g['name']} | id={$g['ID']} | status={$g['status']}\n";
    
    // Show location from config
    $config = @unserialize($g['content']);
    if (is_array($config) && !empty($config['location'])) {
        foreach ($config['location'] as $locGroup) {
            foreach ($locGroup as $loc) {
                echo "  LOCATION: {$loc['param']} {$loc['operator']} {$loc['value']}\n";
            }
        }
    }
    
    // Print fields
    if (!empty($fieldsByParent[$g['ID']])) {
        foreach ($fieldsByParent[$g['ID']] as $field) {
            printField($field, '  ', $fieldsByParent);
        }
    }
    echo "\n";
}
