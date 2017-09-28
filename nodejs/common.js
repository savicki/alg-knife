
const net   = require( "net" );
const dgram = require( "dgram" );
const fs    = require( "fs" );
const path  = require('path');

var __noVerbose = !false;


function __strToBytes( str, retLen )
{
    // TODO: size of return buffer must be == retLen
    var buffer = new Buffer( retLen );
    var match;

    __noVerbose || console.log( "[__strToBytes] str = '%s', retLen = '%s'", str, retLen );

    // TODO: support fixed @retLen values
    if ( typeof(str) == 'number' )
    {
        // TODO: check @retLen value

        buffer.writeInt32BE( str, 0 );
    }
    else
    if ( match = str.match( /(\d+).(\d+).(\d+).(\d+)/ ) )
    {
        for ( ind = 0; ind < 4; ind++ )
        {
            var octet = parseInt( match[ind + 1] ) & 0xFF;
           
            buffer.writeUInt8( octet, ind );
        }
    }

    __noVerbose || console.log( "[__strToBytes] buffer : ", buffer );

    return buffer;
}

function __bytesToStr( bytes, fieldName )
{
    var str = "";

    __noVerbose || console.log( "[__bytesToStr] fieldName = '%s', buffer: ", fieldName, bytes );

    if ( /_ip/.test( fieldName ) && bytes.length == 4 )
    {
        str = bytes.join( "." );
    }
    // TODO: proto?
    else // port, iter_num, thread_num
    {
        str = bytes.readUInt32BE( 0 ).toString();
    }

    __noVerbose || console.log( "[__bytesToStr] str = '%s'", str );

    return str;
}

function __newFuncInfo( func, immutableArgs )
{
    funcCtx = 
    {
        "func" : func,
        "args" : immutableArgs
    }

    return funcCtx;
}

function __runFunc( env, funcInfo, funcArgs )
{
    __noVerbose || console.log( "[__runFunc] : ", funcInfo );

    return funcInfo.func( env, funcInfo.args, funcArgs );
}

function __evalStrToEnv( env, fieldName, strValue )
{
    if ( fieldName.indexOf( "env.assert" ) == 0 )
    {
        var realValue;

        evalStr = "realValue = " + fieldName;

        __noVerbose || console.log( evalStr );
        eval( evalStr );

        if ( realValue != strValue )
        {
            console.error( "*** assert failed: real '%s' != recv '%s'", 
                realValue, strValue );
        }
    }    
    else
    {
        var evalStr = fieldName + " = " + "\"" + strValue + "\""

        __noVerbose || console.log( evalStr );
        eval( evalStr );
    }
}

function __getSendDataInfo( cwd, send_data ) 
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
    else if ( isFileHex )
    {
        var filename = send_data.substr( fileHexPrefixLen ).trim();

        filename = path.join( path.dirname( cwd ), filename );
        __noVerbose || console.log( filename );
        
        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename ), "hex" );
        }
        else
        {
            console.error( "*** file '%s' not found, exit.", filename );
            return null;
        }
    }
    else if ( isFile )
    {
        var filename = send_data.substr( filePrefixLen ).trim();

        filename = path.join( path.dirname( cwd ), filename );
        __noVerbose || console.log( filename );

        if ( fs.existsSync( filename ) )
        {
            send_buff = new Buffer( fs.readFileSync( filename ) );
        }
        else
        {
            console.error( "*** file '%s' not found, exit.", filename );
            return null;
        }
    }
    else
    {
        send_buff = new Buffer( send_data );
    }

    __noVerbose || console.log( "send_buff (hex): '%s'", send_buff.toString( "hex" ) );
    __noVerbose || console.log( "send_buff (str): '%s'", send_buff.toString( ) );
    

    var res = 
    {
        "buffer" : send_buff,
        "isHex"  : isHex | isFileHex
    };

    return res;
}




function compileBuf( isReceival, sendBuf /* tmplData */, hexMap )
{
    var compiledBuf = 
    {
        "useNative" : true,
        "compiled"  : null,
        "fmap"      : {},
        "fargs"     : {},
        "isHex"     : hexMap !== undefined && hexMap !== null,
        "isRecv"    : isReceival
    };

    var fmap = {}
    var funcInfo;

    
    if ( compiledBuf["isHex"] )
    {
        var __evalEnvFromBytes = function( env, immutableArgs, fArgs ) 
        {
            var fieldName = immutableArgs;
            
            bytesLen    = fArgs["bytesLen"];
            offset      = fArgs["offset"];
            recvBuf     = fArgs["rawBytes"];

            __noVerbose || console.log( "[__evalEnvFromBytes] fieldName: '%s', offset: '%s', bytesLen: '%s'", fieldName, offset, bytesLen );
            
            if ( offset + bytesLen <= recvBuf.length )
            {
                var bytes = new Buffer( bytesLen );

                for ( var bytesInd = 0, bytesLen = bytes.length; bytesInd < bytesLen; bytesInd++ )
                {
                    bytes[bytesInd] = recvBuf[offset + bytesInd];
                }

                strValue = __bytesToStr( bytes, fieldName );
                
                
                __evalStrToEnv( env, fieldName, strValue );                
            }
        }

        var __evalEnvToBytes = function( env, immutableArgs, fArgs ) 
        { 
            var evalStr = immutableArgs;
           
            bytesLen    = fArgs["bytesLen"];
            offset      = fArgs["offset"];
            sendBytes   = fArgs["rawBytes"];

            __noVerbose || console.log( "[__evalEnvToBytes] evalStr: '%s', offset: '%s', bytesLen: '%s'", evalStr, offset, bytesLen );

            var parts = evalStr.split( "," );

            if ( parts.length == 2 )
            {
                eval( parts[1] + " = " + parts[0] );

                evalStr = parts[0];
            }

            var bytes = __strToBytes( eval( evalStr ) /* with @env */, bytesLen );

            if ( offset + bytesLen <= sendBytes.length )
            {
                for ( var bytesInd = 0, bytesLen = bytes.length; bytesInd < bytesLen; bytesInd++ )
                {
                    sendBytes[offset + bytesInd] = bytes[bytesInd];
                }
            }
        }


        var hexMapStr = hexMap.toString();
        var lines = hexMapStr.split( /\r|\n|\r\n/ );


        for ( var i = 0, len = lines.length; i < len; i++ )
        {
            var line = lines[i];

            if ( line.indexOf( "#") == 0 )
                continue;

            var match = line.match( /(\d+):(\d?):{{([^}]+)}}/ );

            if ( !match )
                continue;

            var offset = parseInt( match[1] );
            var bytesLen = match[2] ? parseInt( match[2] ) : 4;
            var tmplVar = match[3];

            if ( fmap[tmplVar] )
            {
                funcInfo = fmap[tmplVar];
            }
            else
            {
                var evalStr = tmplVar.replace( /([a-zA-Z_\.]+)/g, "env.$1" );

                funcInfo = __newFuncInfo( isReceival ? __evalEnvFromBytes : __evalEnvToBytes, evalStr );

                fmap[tmplVar] = funcInfo;
            }

            if ( compiledBuf["fmap"][offset] === undefined )
            {
                compiledBuf["fmap"][offset] = [];
                compiledBuf["fargs"][offset] = [];
            }

            compiledBuf["fmap"][offset].push( funcInfo );
            compiledBuf["fargs"][offset].push(
            {
                "bytesLen" : bytesLen,
                "offset"   : offset
            });
        }

        // for sent, keep data to process-then-send
        if ( isReceival == false )
        {
            compiledBuf["compiled"] = sendBuf;
        }
    }
    else // ! hex
    {
        var sendBufStr = sendBuf.toString();
        var funcInd = 0;
        

        if ( isReceival )
        {
            var __evalEnvFromStr = function( env, immutableArgs, args )
            {
                var evalStr = immutableArgs;
                var strValue = args["rawStr"];

                __noVerbose || console.log( "[__evalEnvFromStr] evalStr = '%s'", evalStr );

                __evalStrToEnv( env, evalStr, strValue ); 
            }

            var matchInd = 0;

            sendBufStr = sendBufStr.replace( /{{([^}]+)}}(?:{{([^}]+)}})?/g, function( match, p1, p2 )
            {
                __noVerbose || console.log( p1, p2 )

                if ( p2 )
                {
                    var tmplVar = p1 + p2;

                    if ( fmap[tmplVar] )
                    {
                        funcInfo = fmap[tmplVar];
                    }
                    else
                    {
                        fmap[tmplVar] = funcInfo;


                        var evalStr = p2.replace( /([a-zA-Z_\.]+)/g, "env.$1" );

                        funcInfo = __newFuncInfo( __evalEnvFromStr, evalStr );
                    }

                    compiledBuf["fmap"][matchInd] = funcInfo;
                    compiledBuf["fargs"][matchInd] = {};
                }

                matchInd++;

                return p1;
            });
        }
        else
        {
            var __evalEnvToStr = function( env, immutableArgs, args )
            {
                var evalStr = immutableArgs;

                __noVerbose || console.log( "[__evalToStr] evalStr = '%s'", evalStr );

                var parts = evalStr.split( "," );

                if ( parts.length == 2 )
                {
                    eval( parts[1] + " = " + parts[0] );

                    evalStr = parts[0];
                }

                return eval( evalStr );
            }

            sendBufStr = sendBufStr.replace( /{{([^}]+)}}/g, function( match, p1 )
            {
                var tmplVar = p1;
                var funcName;

                if ( fmap[tmplVar] )
                {
                    funcName = fmap[tmplVar].name;
                }
                else
                {
                    funcName = "func_" + funcInd++;

                    var evalStr = tmplVar.replace( /([a-zA-Z_\.]+)/g, "env.$1" );

                    funcInfo = __newFuncInfo( __evalEnvToStr, evalStr );

                    fmap[tmplVar] = 
                    {
                        "name" : funcName,
                        "func" : funcInfo
                    };

                    compiledBuf["fmap"][funcName] = funcInfo;
                    compiledBuf["fargs"][funcName] = {};
                }

                return "{{" + funcName + "}}";
            });
        }

        // for sent, keep here data to process-then-send
        // for recv, keep recv pattern - recv-then-process
        compiledBuf["compiled"] = sendBufStr;
    }

    compiledBuf["useNative"] = ( Object.keys( compiledBuf["fmap"] ) == 0 );

    // dump compiled info
    __noVerbose || console.log( "[compileBuf] ", compiledBuf );

    return compiledBuf;
}

function runBuf( compiledInfo, env, recvBuf /* just received data, always bytes! */ )
{
    var isReceival = compiledInfo.isRecv;
    var isHex = compiledInfo.isHex;

    // unprocessed by "interpreter" data
    var dataBuf = ( isReceival ) ? recvBuf : compiledInfo.compiled; 

    __noVerbose || console.log( "[runBuf] isReceival: %s, dataBuf IN: '%s'", isReceival, dataBuf.toString( isHex ? "hex" : "" ) );

    if ( compiledInfo.useNative )
    {
        return dataBuf;
    }
    else
    {
        if ( compiledInfo.isHex )
        {
            var offsets = Object.keys( compiledInfo["fmap"] );
            var evalFunc, retLen, bytes;

            for( var i = 0, len = offsets.length; i < len; i++ )
            {
                offset = parseInt( offsets[i] );

                funcInfoArr = compiledInfo["fmap"][offset];
                funcArgsArr = compiledInfo["fargs"][offset];

                var funcInfo, funcArgs;

                for ( var ind = 0; ind < funcInfoArr.length; ind++ )
                {
                    funcInfo = funcInfoArr[ind];
                    funcArgs = funcArgsArr[ind];

                    funcArgs["rawBytes"] = dataBuf; 

                    // [send] internally modify dataBuf
                    __runFunc( env, funcInfo, funcArgs );
                }
            }
        }
        else
        {
            if ( isReceival )
            {
                var dataBufStr = dataBuf.toString();

                //__noVerbose || console.log( compiledInfo.compiled )

                var match = dataBufStr.match( "^" + compiledInfo.compiled + "$" );

                if ( match )
                {
                    var matchIndexes = Object.keys( compiledInfo["fmap"] );

                    for( var i = 0, len = matchIndexes.length; i < len; i++ )
                    {
                        var matchIndex = parseInt( matchIndexes[i] );

                        __noVerbose || console.log( "**** " + match[matchIndex + 1] )

                        funcInfo = compiledInfo["fmap"][matchIndex];
                        funcArgs = compiledInfo["fargs"][matchIndex];

                        funcArgs["rawStr"] = match[matchIndex + 1];

                        __runFunc( env, funcInfo, funcArgs );
                    }
                }
                else
                {
                    console.error( "*** received message don't match pattern!" );

                    return null;
                }
            }
            else
            {
                var doSecondRound = false;

                // make 2 iterations, 2nd - for correct "Content-Length: " tmpl placement
                for( var round = 0; round < 2; round++ )
                {
                    dataBuf = dataBuf.replace( /{{([^}]+)}}/g, function( match, p1 )
                    {
                        var funcName = p1;

                        funcInfo = compiledInfo["fmap"][funcName];
                        funcArgs = compiledInfo["fargs"][funcName];

                        funcArgs["rawStr"] = p1; // not used, here just as guideline
                        
                        if ( funcInfo.args == "env.content_length" && env.content_length == undefined  )
                        {
                            doSecondRound = true;

                            return match;
                        }
                        else
                        {
                            var replacement = __runFunc( env, funcInfo, funcArgs );

                            return replacement;
                        }
                    });

                    if ( doSecondRound )
                    {
                        var bodyStInd = dataBuf.indexOf( "\r\n\r\n" );
                        
                        env.content_length = ( bodyStInd != -1 ) ? ( dataBuf.length - (bodyStInd += "\r\n\r\n".length) ) : 0;
                    }
                    else
                        break;
                }
            }
        }

        __noVerbose || console.log( "[runBuf] isReceival: %s, dataBuf OUT: '%s'", isReceival, dataBuf.toString( isHex ? "hex" : "" ) );
    }

    return dataBuf;
}

function emitRTP2( rtpInfo, interval, completeFn )
{
    return emitRTP( 
        rtpInfo["proto"], 
        rtpInfo["local_ip"],
        rtpInfo["local_port"], 
        rtpInfo["remote_ip"], 
        rtpInfo["remote_port"], 
        rtpInfo["msg"], 
        interval,
        completeFn
    );
}

// CLIENT: invoked after receiving response (and parsing it) from vs.
// SERVER: invoked after sending response (and parsing it) from vs.
// stopped after delay interval (before next iteration)
function emitRTP( trans_proto, local_ip, local_port, dst_ip, dst_port, send_msg, interval, completeFn )
{
    var initiator = ( send_msg != null );

    console.log();
    console.log( "[RTP] run for %s sec, initiator: %s, RTP: [%s] %s:%s --> %s:%s", 
        interval, initiator ? "yes" : "no",  
        trans_proto, 
        initiator ? local_ip : dst_ip, 
        initiator ? local_port : dst_port, 
        initiator ? dst_ip : local_ip, 
        initiator ? dst_port : local_port
    );

    interval *= 1000;

    var sendPkt = 0, recvPkt = 0;

    if ( trans_proto == "tcp" )
    {
        if ( send_msg == null )
        {
            var tcp_server = net.createServer( function( tcp_client )
            {
                // linux: fix socket.close event issue where socket's fields are undefined
                var remoteAddress = tcp_client.remoteAddress;
                var remotePort = tcp_client.remotePort;

                console.log( "[RTP-tcp] connected [from %s:%s]", remoteAddress, remotePort );

                if ( remoteAddress != dst_ip || remotePort != dst_port )
                {
                    console.error( "*** [RTP-tcp] reject RTP connection [from %s:%s], expected from %s:%s", 
                        remoteAddress, remotePort, dst_ip, dst_port )

                    tcp_client.destroy();
                }
                else
                {
                    setTimeout(function()
                    {
                        tcp_client.destroy();
                        //console.log( "[RTP-tcp] send: %s pkts, recv: %s pkts", sendPkt, recvPkt );

                        if ( completeFn )
                            completeFn();

                    }, interval);

                    tcp_client.on( "data", function( msg ) 
                    {
                        recvPkt++;

                        //console.log( "[RTP-tcp] recv>'%s' [%s bytes] [from %s:%s]",
                        //   msg.toString(), msg.length, remoteAddress, remotePort );

                        var reply_msg = msg.toString().split( "" ).reverse().join( "" );

                        tcp_client.write( reply_msg, function()
                        {
                            sendPkt++;

                            console.log( "[RTP-tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                                reply_msg.toString(), reply_msg.length, remoteAddress, remotePort );
                        });           
                    });
                    
                    tcp_client.on( "close", function() 
                    {
                        console.log( "[RTP-tcp] disconnected [from %s:%s]", remoteAddress, remotePort );
                    });

                    tcp_client.on( "error", function()
                    {
                        console.log( "[RTP-tcp] connection error" );
                    });
                }
            });

            tcp_server.listen( local_port, local_ip );
        }
        else
        {
            var tcp_client = new net.Socket();

            var connectOpts = 
            {
                localAddress : local_ip,
                localPort : local_port,
                family : 4,
                host : dst_ip,
                port : dst_port
            };

            tcp_client.connect( connectOpts, function() 
            {
                console.log( "[RTP-tcp] connected [to %s:%s]", dst_ip, dst_port );

                setTimeout(function()
                {
                    tcp_client.destroy();
                    //console.log( "[RTP-tcp] send: %s pkts, recv: %s pkts", sendPkt, recvPkt );

                    if ( completeFn )
                        completeFn();

                }, interval);
            });

            tcp_client.on( "data", function( msg )
            {
                recvPkt++;

                console.log( "[RTP-tcp] recv>'%s' [%s bytes] [from %s:%s]",
                    msg.toString(), msg.length, dst_ip, dst_port);

                var reply_msg = msg.toString().split( "" ).reverse().join( "" );

                tcp_client.write( reply_msg, function()
                {
                    sendPkt++;

                    //console.log( "[RTP-tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                    //    reply_msg.toString(), reply_msg.length, dst_ip, dst_port );
                }); 
            });

            tcp_client.on( "close", function()
            {
                console.log( "[RTP-tcp] connection closed" );
            });

            tcp_client.on( "error", function()
            {
                console.log( "[RTP-tcp] connection error" );
            });

            // do initial send
            tcp_client.write( send_msg, function()
            {
                console.log( "[RTP-tcp] sent>'%s' [%s bytes] [to %s:%s]", 
                    send_msg.toString(), send_msg.length, dst_ip, dst_port );
                console.log();
            });
        }
    }
    else if ( trans_proto == "udp" )
    {
        var local = dgram.createSocket('udp4');

        var isActiveOpen = ( dst_ip && dst_port && send_msg );
        var isEmitRun = false;
        var isEmitStopped = false;

        var recvPkt = 0, sendPkt = 0;


        var __doSendMsg = function( sock, msg, port, ip )
        {
            if ( isEmitStopped )
                return;

            sock.send( msg, 0, msg.length, port, ip, function()
            {
                if ( isEmitStopped )
                    return;

                sendPkt++;

                // console.log( "[RTP-udp] send>'%s' [%s bytes] [to %s:%s]", 
                //     msg.toString(), msg.length, ip, port );  
                              
                __doSendMsg( sock, msg, port, ip );
            });
        }

        local.on( "[RTP-udp] listening", function() 
        {
            var address = local.address();

            console.log( "[RTP-udp] listening on %s:%s", address.address, address.port );
        });

        local.bind( local_port, local_ip, function()
        {
            // schedule destroy timer
            setTimeout(function()
            {
                isEmitStopped = true;
                local.close();
                
                console.log( "[RTP-udp] send: %s pkts, recv: %s pkts", sendPkt, recvPkt );
                console.log();

                if ( completeFn )
                    completeFn();

            }, interval);


            if ( isActiveOpen )
            {
                isEmitRun = true;

                console.log( "[RTP-udp] active send>'%s' [%s bytes] [to %s:%s]", 
                    send_msg.toString(), send_msg.length, dst_ip, dst_port );

                // start sending
                __doSendMsg( local, send_msg, dst_port, dst_ip );
            }
        });

        local.on( "message", function( msg, remote ) 
        {
            if ( !isActiveOpen && !isEmitRun )
            {
                isEmitRun = true;

                console.log( "[RTP-udp] active recv>'%s' [%s bytes] [from %s:%s]", 
                    msg.toString(), msg.length, remote.address, remote.port );

                // start sending
                __doSendMsg( local, msg, dst_port, dst_ip );
            }

            // console.log( "[RTP-udp] recv>'%s' [%s bytes] [from %s:%s]", 
            //    msg.toString(), msg.length, remote.address, remote.port );

            recvPkt++;
        });

        local.on( "error", function()
        {
            local.close();
        })
    }
}

// tcp 127.0.0.1 9001 "\x0000" "rep: 3" "wmap: "  "rmap: "

// tcp 127.0.0.1 9001 "\x0000" "rep: 3" "delay: 2" "wmap: "  "rmap: "

function parseArgs( argv, helpFn )
{
    var argInd = 2;
    var argsCount = argv.length - argInd;

    if ( argsCount < 4 )
    {
        helpFn();

        return null;
    }

    var sendDataInfo = __getSendDataInfo( argv[1] /* cwd */, process.argv[argInd + 3] );

    if ( sendDataInfo == null )
        return null;

    var args = 
    {
        "cwd"       : argv[1],
        "proto"     : process.argv[argInd + 0].toLowerCase(),
        "ip"        : process.argv[argInd + 1],
        "port"      : parseInt(process.argv[argInd + 2]),
        "sendData"  : sendDataInfo
    };

    var optArgs = [ "rep", "delay", "wmap", "rmap", "rtp", "v" ];

    for ( var ind = argInd + 4; ind < argv.length; ind++ )
    {
        var argNameValue = argv[ind];

        //console.log( argNameValue, typeof( argNameValue ) )

        for ( var j = 0; j < optArgs.length; j++ )
        {
            var optArg = optArgs[j];

            if ( argNameValue.indexOf( optArg + ": " ) == 0 )
            {
                var argValueStr = argNameValue.substr( (optArg + ": ").length );

                var argValueInt = parseInt( argValueStr );

                if ( argValueInt.toString() == argValueStr )
                    args[optArg] = argValueInt;
                else
                    args[optArg] = argValueStr;
            }
        }
    }

    console.log( "[parseArgs] : args: ", args );

    return args;
}

function getEnv()
{
    var env = 
    {
        "remote_ip" : "127.0.0.1",
        "remote_port" : 12,

        update : function( vars )
        {
            var keys = Object.keys( vars );

            for( var i = 0; i < keys.length; i++ )
            {
                var key = keys[i];

                this[key] = vars[key];
            }
        },

        print : function( prefix )
        {
            console.log();

            if ( prefix )
                console.log( "'%s'" + ":", prefix );

            var keys = Object.keys( this );

            for( var i = 0; i < keys.length; i++ )
            {
                var key = keys[i];

                if ( typeof( this[key] ) != "function" )
                    console.log( "'%s':'%s'", key, this[key] );
            }

            console.log();
        },

        // env.assert( env.remote_ip )
        assert : function( fieldValue ) 
        {
            __noVerbose || console.log( "[assert] : fieldValue = %s", fieldValue );

            return fieldValue;
        }        
    }

    return env;
}

function compileBufs( args )
{
    var isHexMode = args.sendData.isHex;
    var sendComp, recvComp;

    // compile send data
    if ( isHexMode )
    {
        var writeMap = args["wmap"] ? fs.readFileSync( args["wmap"] ) : "";
        
        sendComp = compileBuf( false /* !recv */, args.sendData.buffer, writeMap /* hex */ );
    }
    else
    {
        sendComp = compileBuf( false /* !recv */, args.sendData.buffer, null /* !hex */ );
    }

    // compile recv data
    if ( args["rmap"] )
    {
        var readMap = fs.readFileSync( args["rmap"] );

        if ( isHexMode )
        {
            recvComp = compileBuf( true /* recv */, null, readMap /* hex */ );
        }
        else
        {
            recvComp = compileBuf( true /* recv */, readMap, null /* !hex */ );
        }
    }

    var res = 
    {
        "recvComp" : recvComp,
        "sendComp" : sendComp
    };

    return res;
}

function setVerbose( on )
{
    console.log( "[setVerbose] on : %s", on );

    __noVerbose = !on;
}

// "{{rtp_proto}} {{local_ip}} {{iter_num+1024}} {{rtp_remote_ip}} {{rtp_remote_port}} emit_data"
function parseRTParg( rtpArg )
{
    rtpArg = rtpArg.replace( /{{([^}]+)}}/g, function( match, p1 )
    {
        return "env." + p1;
    });

    return rtpArg;
}

function getRTPinfo( env, rtpTmpl )
{
    __noVerbose || console.log( '%s', rtpTmpl );

    var info = null;

    var rtpVal = rtpTmpl.replace( /env\.[^ ]+/g, function( p )
    {
        var rtpValItem = eval( p );

        //console.log( rtpValItem );
        return rtpValItem;
    });

    var match = rtpVal.match( /([a-zA-Z]{3})\s+(\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3})\s+(\d{4,5})\s+(\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3})\s+(\d{4,5})\s*([\w\W]+)?$/ );

    if ( match )
    {
        info =
        {
            "proto":        match[1],
            "local_ip" :    match[2],
            "local_port" :  parseInt( match[3] ),
            "remote_ip" :   match[4],
            "remote_port" : parseInt( match[5] ),
            "msg" : match[6] ? new Buffer(match[6]) : null
        };
    }

    __noVerbose || console.log(info)

    return info;
}

//module.exports.getSendDataInfo  = getSendDataInfo;

module.exports.compileBuf       = compileBuf;
module.exports.runBuf           = runBuf;

module.exports.emitRTP          = emitRTP;
module.exports.emitRTP2         = emitRTP2;

module.exports.parseArgs        = parseArgs;
module.exports.getEnv           = getEnv;
module.exports.compileBufs      = compileBufs;
module.exports.setVerbose       = setVerbose;

module.exports.parseRTParg      = parseRTParg;
module.exports.getRTPinfo       = getRTPinfo;

module.exports.CONTROL_PORT     = 6001;
module.exports.ITER_TMPL_HEAD   = "[%s] ================================== iteration: %s ==================================";
module.exports.ITER_TMPL_FOOTER = "[%s] ================================== iteration end ==================================\n";