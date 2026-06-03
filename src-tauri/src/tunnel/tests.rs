// Unit tests for the tunnel module.
//
// End-to-end forwarding tests (local/dynamic/remote) require a live SSH server
// and are covered by the Docker test setup in docker/. These tests focus on
// logic that is fully exercisable without a network connection.

#[cfg(test)]
mod socks5 {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    use crate::tunnel::dynamic::socks5_negotiate;

    /// Runs the SOCKS5 client side of the handshake in a background thread,
    /// returns (target_host, target_port) parsed by the server side.
    fn handshake_with(client_fn: impl FnOnce(TcpStream) + Send + 'static) -> (String, u16) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        thread::spawn(move || {
            let stream = TcpStream::connect(addr).unwrap();
            client_fn(stream);
        });

        let (mut server_stream, _) = listener.accept().unwrap();
        server_stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        socks5_negotiate(&mut server_stream).unwrap()
    }

    fn write_ipv4_request(s: &mut TcpStream, ip: [u8; 4], port: u16) {
        // Greeting: version 5, one method (no-auth)
        s.write_all(&[0x05, 0x01, 0x00]).unwrap();
        // Request: CONNECT, IPv4
        s.write_all(&[0x05, 0x01, 0x00, 0x01]).unwrap();
        s.write_all(&ip).unwrap();
        s.write_all(&port.to_be_bytes()).unwrap();
        // Read the replies (10 bytes total: method + response)
        let mut buf = [0u8; 12];
        let _ = s.read(&mut buf);
    }

    fn write_domain_request(s: &mut TcpStream, domain: &str, port: u16) {
        s.write_all(&[0x05, 0x01, 0x00]).unwrap();
        s.write_all(&[0x05, 0x01, 0x00, 0x03]).unwrap();
        s.write_all(&[domain.len() as u8]).unwrap();
        s.write_all(domain.as_bytes()).unwrap();
        s.write_all(&port.to_be_bytes()).unwrap();
        let mut buf = [0u8; 12];
        let _ = s.read(&mut buf);
    }

    #[test]
    fn parses_ipv4_address() {
        let (host, port) = handshake_with(|mut s| {
            write_ipv4_request(&mut s, [10, 0, 0, 1], 8080);
        });
        assert_eq!(host, "10.0.0.1");
        assert_eq!(port, 8080);
    }

    #[test]
    fn parses_domain_name() {
        let (host, port) = handshake_with(|mut s| {
            write_domain_request(&mut s, "db.internal", 5432);
        });
        assert_eq!(host, "db.internal");
        assert_eq!(port, 5432);
    }

    #[test]
    fn parses_ipv4_loopback_with_non_standard_port() {
        let (host, port) = handshake_with(|mut s| {
            write_ipv4_request(&mut s, [127, 0, 0, 1], 12345);
        });
        assert_eq!(host, "127.0.0.1");
        assert_eq!(port, 12345);
    }

    #[test]
    fn rejects_wrong_socks_version() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let mut s = TcpStream::connect(addr).unwrap();
            s.write_all(&[0x04, 0x01, 0x00]).unwrap(); // SOCKS4, not SOCKS5
        });
        let (mut server, _) = listener.accept().unwrap();
        server
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        assert!(socks5_negotiate(&mut server).is_err());
    }

    #[test]
    fn rejects_unsupported_command() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let mut s = TcpStream::connect(addr).unwrap();
            // Greeting (no-auth)
            s.write_all(&[0x05, 0x01, 0x00]).unwrap();
            let mut buf = [0u8; 2];
            let _ = s.read(&mut buf);
            // UDP ASSOCIATE (0x03) — not supported
            s.write_all(&[0x05, 0x03, 0x00, 0x01, 127, 0, 0, 1, 0, 80])
                .unwrap();
            let mut buf = [0u8; 10];
            let _ = s.read(&mut buf);
        });
        let (mut server, _) = listener.accept().unwrap();
        server
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        assert!(socks5_negotiate(&mut server).is_err());
    }

    #[test]
    fn rejects_auth_required_client() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let mut s = TcpStream::connect(addr).unwrap();
            // Offers only username/password auth (0x02), not no-auth (0x00)
            s.write_all(&[0x05, 0x01, 0x02]).unwrap();
            let mut buf = [0u8; 2];
            let _ = s.read(&mut buf);
        });
        let (mut server, _) = listener.accept().unwrap();
        server
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        assert!(socks5_negotiate(&mut server).is_err());
    }
}

#[cfg(test)]
mod manager {
    use crate::tunnel::TunnelManager;

    #[test]
    fn new_manager_has_no_active_tunnels() {
        let mgr = TunnelManager::new();
        assert!(mgr.active_ids().is_empty());
        assert!(!mgr.is_active("anything"));
    }

    #[test]
    fn stop_nonexistent_tunnel_returns_not_found() {
        let mgr = TunnelManager::new();
        assert!(matches!(
            mgr.stop("no-such-id"),
            Err(crate::error::AppError::NotFound(_))
        ));
    }
}
