<?php

/** Loopback SMTP relay that accepts plaintext and never offers STARTTLS; it logs every command the client sends. */
[, $port, $log] = $argv;

$server = stream_socket_server("tcp://127.0.0.1:{$port}", $errno, $errstr);
if ($server === false) {
    fwrite(STDERR, "cannot listen: {$errstr}\n");
    exit(1);
}
fwrite(STDOUT, "listening\n");

while ($connection = @stream_socket_accept($server, 60)) {
    fwrite($connection, "220 plain relay ready\r\n");
    while (($line = fgets($connection)) !== false) {
        file_put_contents($log, $line, FILE_APPEND);
        $command = strtoupper(trim($line));
        if (str_starts_with($command, 'EHLO') || str_starts_with($command, 'HELO')) {
            fwrite($connection, "250 plain relay\r\n");
        } elseif (str_starts_with($command, 'QUIT')) {
            fwrite($connection, "221 bye\r\n");
            break;
        } else {
            fwrite($connection, "250 ok\r\n");
        }
    }
    fclose($connection);
}
