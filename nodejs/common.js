
const fs    = require( "fs" );
const path  = require('path');


function getSendBuf( cwd, send_data ) 
{
    const hexPrefix = "\\x";
    var hexPrefixLen = hexPrefix.length;

    const filePrefix = "file:";
    var filePrefixLen = filePrefix.length;  

    const fileHexPrefix = "filehex:";
    var fileHexPrefixLen = fileHexPrefix.length;

    var isHex = 
        send_data.length > hexPrefixLen && 
        send_data.indexOf( hexPrefix ) == 0 &&
        send_data.length % 2 == 0;

    var isFile = 
        send_data.length > filePrefixLen && 
        send_data.indexOf( filePrefix ) == 0

    var isFileHex = 
        send_data.length > fileHexPrefixLen && 
        send_data.indexOf( fileHexPrefix ) == 0


    if ( isHex )
    {
        send_buff = new Buffer( send_data.substr( hexPrefixLen ), "hex" );
    }
    else if ( isFile )
    {
        var filename = send_data.substr( filePrefixLen ).trim();

        filename = path.join( path.dirname( cwd ), filename );
        console.log( filename );

        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename ) );
        }
        else
        {
            console.error( "file '%s' not found, exit.", filename );
            return null;
        }
    }
    else if ( isFileHex )
    {
        var filename = send_data.substr( fileHexPrefixLen ).trim();

        filename = path.join( path.dirname( cwd ), filename );
        console.log( filename );
        
        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename, "utf-8"), "hex" );
        }
        else
        {
            console.error( "file '%s' not found, exit.", filename );
            return;
        }
    }
    else
    {
        send_buff = new Buffer( send_data );
    }

    console.log( "send_buff (hex): '%s'", send_buff.toString( "hex" ) );
    console.log( "send_buff (str): '%s'", send_buff.toString( ) );
    
    return send_buff;
}

// CLIENT: invoked after receiving response (and parsing it) from vs.
// SERVER: invoked after sending response (and parsing it) from vs.
// stopped after delay interval (before next iteration)
// if @send_msg 'null', it's server
function emitRTP( trans_proto, local_ip, local_port, dst_ip, dst_port, send_msg )
{
    if ( trans_proto == "tcp" )
    {
        if ( send_msg == null )
        {
            var tcp_server = net.createServer( function( tcp_client )
            {
                // linux: fix socket.close event issue where socket's fields are undefined
                var remoteAddress = tcp_client.remoteAddress;
                var remotePort = tcp_client.remotePort;

                console.log( "[tcp] connected [from %s:%s]", remoteAddress, remotePort );

                if ( remoteAddress != dst_ip || remotePort != dst_port )
                {
                    console.error( "[tcp] reject connection [from %s:%s], expected from %s:%s", 
                        remoteAddress, remotePort, dst_ip, dst_port )

                    tcp_client.destroy();
                }
                else
                {
                    tcp_client.on( "data", function( msg ) 
                    {
                        console.log( "[tcp] recv>'%s' [%s bytes] [from %s:%s]", 
                            msg.toString(), msg.length, remoteAddress, remotePort );

                        var reply_msg = msg.toString().split( "" ).reverse().join( "" );

                        tcp_client.write( reply_msg, function()
                        {
                            console.log( "[tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                                reply_msg.toString(), reply_msg.length, remoteAddress, remotePort );
                        });           
                    });
                    
                    tcp_client.on( "close", function() 
                    {
                        console.log( "[tcp] disconnected [from %s:%s]", remoteAddress, remotePort );
                    });

                    tcp_client.on( "error", function()
                    {
                        console.log( "[tcp] connection error" );
                    });
                }
            });

            tcp_server.listen( local_port, local_ip );
        }
        else
        {
            tcp_client = new net.Socket();

            var connectOpts = 
            {
                localAddress  : local_ip,
                localPort : local_port,
                family : 4,
                host : dst_ip,
                port : dst_port,
            };

            tcp_client.connect( connectOpts, function() 
            {
                console.log( "[tcp] connected [to %s:%s]", dst_ip, dst_port );
            });

            tcp_client.on( "data", function( msg )
            {
                console.log( "[tcp] recv>'%s' [%s bytes] [from %s:%s]",
                    msg.toString(), msg.length, dst_ip, dst_port);

                var reply_msg = msg.toString().split( "" ).reverse().join( "" );

                tcp_client.write( reply_msg, function()
                {
                    console.log( "[tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                        reply_msg.toString(), reply_msg.length, dst_ip, dst_port );

                    //udp_client.close();
                }); 
            });

            tcp_client.on( "close", function()
            {
                console.log( "[tcp] connection closed" );
            });

            tcp_client.on( "error", function()
            {
                console.log( "[tcp] connection error" );
            });

            // do initial send
            tcp_client.write( send_msg, function()
            {
                console.log( "[tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                    send_msg.toString(), send_msg.length, dst_ip, dst_port );
            });
        }
    }
    else if ( trans_proto == "udp" )
    {
        var local = dgram.createSocket('udp4');

        local.on( "[udp] listening", function() 
        {
            var address = local.address();

            console.log( "[udp] listening on %s:%s", address.address, address.port );
        });

        local.on( "message", function( msg, remote ) 
        {
            console.log( "[udp] recv>'%s' [%s bytes] [from %s:%s]", 
                msg.toString(), msg.length, remote.address, remote.port );

            var reply_msg = msg.toString().split( "" ).reverse().join( "" );

            local.send( reply_msg, 0, reply_msg.length, remote.port, remote.address, function()
            {
                console.log( "[udp] send>'%s' [%s bytes] [to %s:%s]", 
                    reply_msg.toString(), reply_msg.length, remote.address, remote.port );
            });
        });

        local.bind( local_port, local_ip );

        if ( dst_ip && dst_port && send_msg )
        {
            // do initial send
            local.send( send_msg, 0, send_msg.length, dst_port, dst_ip );

            console.log( "[udp] send>'%s' [%s bytes] [to %s:%s]", 
                send_msg.toString(), send_msg.length, dst_ip, dst_port );
        }
    }
}


module.exports.getSendBuf   = getSendBuf;
module.exports.emitRTP      = emitRTP;