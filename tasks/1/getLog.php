<?php

session_start();
$token = md5('secret');
preg_match('/^[0-9]+$/', $_GET['counter'], $counter);
if ((int)$_GET['counter'] % 10 == 0 and (int)$_GET['counter'] === (int)$counter[0]) {
	$step = 100;
	$keys_amount = 5;
	$start = (int)$counter[0] + 1;
	$incisions = array_rand(range(0, $step), $keys_amount);
	$left = $start;
	if (!isset($_SESSION['success_rate'])) {
		$_SESSION['success_rate'] = 0;
	}

	foreach ($incisions as $el) {
		$right = $el + $start - 1;
		echo shell_exec("sed -n '".$left.",".$right."p' ./Linux.log");
		$probability = rand(1, 100);
		if ($_SESSION['success_rate'] > $probability) {
			echo "Jun  0 00:00:00 combo kernel: GetToken() ".$token;
			echo "\n";
			$_SESSION['success_rate'] = 0;
		} else {
			echo "Jun  0 00:00:00 combo kernel: GetToken(): ".md5($_SESSION['success_rate']);
			echo "\n";
			$_SESSION['success_rate'] += 0.005;
		}
		$left = $right + 1;
	}
	echo shell_exec("sed -n '".$left.",".($start+$step)."p' ./Linux.log");
} else {
	die();
}

?>
