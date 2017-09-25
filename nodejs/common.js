
const fs    = require( "fs" );
const path  = require('path');



function __strToBytes( str, retLen )
{
    // TODO: size of return buffer must be == retLen
    var buffer = new Buffer( retLen );
    var match;

    console.log( "[__strToBytes] str = '%s', retLen = '%s'", str, retLen );

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

    console.log( "[__strToBytes] buffer : ", buffer );

    return buffer;
}

function __bytesToStr( bytes, fieldName )
{
    var str = "";

    console.log( "[__bytesToStr] fieldName = '%s', buffer: ", fieldName, bytes );

    if ( /_ip/.test( fieldName ) && bytes.length == 4 )
    {
        str = bytes.join( "." );
    }
    // TODO: proto?
    else // port, iter_num, thread_num
    {
        str = bytes.readUInt32LE( 0 ).toString();
    }

    console.log( "[__bytesToStr] str = '%s'", str );

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
    console.log( "[__runFunc] : ", funcInfo );

    return funcInfo.func( env, funcInfo.args, funcArgs );
}

function __evalStrToEnv( env, fieldName, strValue )
{
    if ( fieldName.startsWith( "env.assert" ) )
    {
        var realValue;

        evalStr = "realValue = " + fieldName;

        console.log( evalStr );
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

        console.log( evalStr );
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


    if ( hexMap )
    {
        var __evalEnvFromBytes = function( env, immutableArgs, fArgs ) 
        {
            var fieldName = immutableArgs;
            
            bytesLen    = fArgs["bytesLen"];
            offset      = fArgs["offset"];
            recvBuf     = fArgs["rawBytes"];

            console.log( "[__evalFromBytes] fieldName: '%s', offset: '%s', bytesLen: '%s'", fieldName, offset, bytesLen );
            
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

            console.log( "[__evalToBytes] evalStr: '%s', offset: '%s', bytesLen: '%s'", evalStr, offset, bytesLen );

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
                var evalStr = tmplVar.replace( /([a-zA-Z_]+)/g, "env.$1" );

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
            compiledBuf["compiled"] = sendBuf;
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

                console.log( "[__evalEnvFromStr] evalStr = '%s'", evalStr );

                __evalStrToEnv( env, evalStr, strValue ); 
            }

            var matchInd = 0;

            sendBufStr = sendBufStr.replace( /{{([^}]+)}}(?:{{([^}]+)}})?/g, function( match, p1, p2 )
            {
                console.log( p1, p2 )

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


                        var evalStr = p2.replace( /([a-zA-Z_]+)/g, "env.$1" );

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

                console.log( "[__evalToStr] evalStr = '%s'", evalStr );

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

                    var evalStr = tmplVar.replace( /([a-zA-Z_]+)/g, "env.$1" );

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
    console.log( "[compileBuf] ", compiledBuf );

    return compiledBuf;
}

function runBuf( compiledInfo, env, recvBuf /* just received data, always bytes! */ )
{
    var isReceival = compiledInfo.isRecv;
    var isHex = compiledInfo.isHex;

    // unprocessed by "interpreter" data
    var dataBuf = ( isReceival ) ? recvBuf : compiledInfo.compiled; 

    console.log( "[runBuf] dataBuf IN: '%s'", dataBuf.toString( isHex ? "hex" : "" ) );

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

                //console.log( compiledInfo.compiled )

                var match = dataBufStr.match( "^" + compiledInfo.compiled + "$" );

                var matchIndexes = Object.keys( compiledInfo["fmap"] );

                for( var i = 0, len = matchIndexes.length; i < len; i++ )
                {
                    var matchIndex = parseInt( matchIndexes[i] );

                    console.log( "**** " + match[matchIndex + 1] )

                    funcInfo = compiledInfo["fmap"][matchIndex];
                    funcArgs = compiledInfo["fargs"][matchIndex];

                    funcArgs["rawStr"] = match[matchIndex + 1];

                    __runFunc( env, funcInfo, funcArgs );
                }
            }
            else
            {
                dataBuf = dataBuf.replace( /{{([^}]+)}}/g, function( match, p1 )
                {
                    var funcName = p1;

                    funcInfo = compiledInfo["fmap"][funcName];
                    funcArgs = compiledInfo["fargs"][funcName];

                    funcArgs["rawStr"] = p1; // not used, here just as guideline
                    
                    var replacement = __runFunc( env, funcInfo, funcArgs );

                    return replacement;
                });
            }
        }

        console.log( "[runBuf] dataBuf OUT: '%s'", dataBuf.toString( isHex ? "hex" : "" ) );
    }

    return dataBuf;
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
                localAddress : local_ip,
                localPort : local_port,
                family : 4,
                host : dst_ip,
                port : dst_port
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

    var args = 
    {
        "cwd"       : argv[1],
        "proto"     : process.argv[argInd + 0].toLowerCase(),
        "ip"        : process.argv[argInd + 1],
        "port"      : parseInt(process.argv[argInd + 2]),
        "sendData"  : sendDataInfo
    };

    var optArgs = [ "rep", "delay", "wmap", "rmap" ];

    for ( var ind = argInd + 4; ind < argv.length; ind++ )
    {
        var argNameValue = argv[ind];

        console.log( argNameValue )

        for ( var j = 0; j < optArgs.length; j++ )
        {
            var optArg = optArgs[j];

            if ( argNameValue.startsWith( optArg + ": " ) )
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

        print : function()
        {
            var keys = Object.keys( this );

            for( var i = 0; i < keys.length; i++ )
            {
                var key = keys[i];

                if ( typeof( this[key] ) != "function" )
                    console.log( "'%s':'%s'", key, this[key] );
            }
        },

        // env.assert( env.remote_ip )
        assert : function( fieldValue ) 
        {
            console.log( "[assert] : fieldValue = %s", fieldValue );

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

// module.exports.updateEnvVars    = updateEnvVars;
// module.exports.printEnvVars     = printEnvVars;
//module.exports.getSendDataInfo  = getSendDataInfo;

module.exports.compileBuf       = compileBuf;
module.exports.runBuf           = runBuf;

module.exports.emitRTP          = emitRTP;
module.exports.parseArgs        = parseArgs;
module.exports.getEnv           = getEnv;
module.exports.compileBufs      = compileBufs;