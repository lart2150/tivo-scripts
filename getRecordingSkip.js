'use strict'
import {TivoWs} from './lib/tivo-ws.js';
import {config} from './config.js';
import {formatName} from './lib/util.js';
import fs from 'fs';

const doit = async (recordingId) => {
    const tivo = new TivoWs(
        config.username,
        config.password,
        config.tsn
    );
    await tivo.connect();
    console.log('connected');

    //const recordingId = "tivo:rc.16052569";

    const recordingInfo = await tivo.getRecordingInfo(recordingId);
    const recording = recordingInfo.recording[0];

    let skip = null;
    
    if (recordingInfo.recording && recordingInfo.recording[0]) {
        if (recording.clipMetadata && recording.clipMetadata[0] && recording.clipMetadata[0].segmentType === 'adSkip') {
            skip = await tivo.cipMetaDataSearch(recording.clipMetadata[0].clipMetadataId, recordingId);
            // console.log(JSON.stringify(skip));
        }
    } else {
        console.error('Recording does not have Skip metadata');
        return;
    }

    skip = {"authorId":"kinetiq_program_segments_1.2","channelAffiliate":"NBC Affiliate","channelNumber":"1203","channelSourceType":"cable","channelStationId":"tivo:st.69023168","clipMetadataId":"tivo:cm.260698","contentEpisodeNumber":7,"contentId":"tivo:ct.445501732","contentSeasonNumber":3,"contentSubtitle":"Take It Our Back","contentTitle":"Making It","createDate":"1970-01-01","description":"version 1.0","offerStartTime":"2021-08-20 01:00:00","segment":[{"endOffset":"4088185","keyword":["AUTO_SKIP_MODE"],"startOffset":"3613358","type":"clipSegment"},{"endOffset":"4893182","startOffset":"4297965","type":"clipSegment"},{"endOffset":"5421111","startOffset":"5096965","type":"clipSegment"},{"endOffset":"5991095","startOffset":"5616241","type":"clipSegment"},{"endOffset":"6586110","startOffset":"6205927","type":"clipSegment"},{"endOffset":"7232220","startOffset":"6780910","type":"clipSegment"}],"segmentType":"adSkip","type":"clipMetadata"};

    if (!skip.segment?.length > 0) {
        console.error('failed to pull skip metadata');
        return;
    }
    
    
    
    const streaming = await tivo.sendRequest({
        "clientUuid": "5678",
        "deviceConfiguration": {
          "deviceType": "webPlayer",
          "type": "deviceConfiguration"
        },
        "sessionType": "streaming",
        "hlsStreamDesiredVariantsSet": "ABR",
        "supportedEncryption": {
          "type": "hlsStreamEncryptionInfo",
          "encryptionType": "hlsAes128Cbc"
        },
        "isLocal": true,
        "recordingId": recordingId,
        "type": "hlsStreamRecordingRequest",
      });

    // console.log('streaming', streaming);
    // console.log('playlistUrl', `http://${config.ip}:49152${streaming.hlsSession.playlistUri}`);

    const hlsSessionId = streaming.hlsSession.hlsSessionId;

    let offset = -1;
    try {
        //this seems to work most of the time
        let whatsOn = await tivo.sendRequest({"hlsSessionId":hlsSessionId,"type":"whatsOnSearch", SchemaVersion: 38});
        // console.log('whatsOn', whatsOn.whatsOn[0]);

        if (whatsOn.whatsOn[0].recordingId === recordingId) {
            // console.log('SUCESS! offset: ' + whatsOn.whatsOn[0].streamPositionMs)
            offset = whatsOn.whatsOn[0].streamPositionMs;
        }
    } finally {
        const cancle = await tivo.sendRequest({"clientUuid":"5678","hlsSessionId":hlsSessionId,"type":"hlsStreamRelease"});
        // console.log('cancle', cancle);
    }
    tivo.disconnect();
    

    if(offset < 0) {
        console.error('failed to find skip offset');
        return;
    }

    const segments = skip.segment.sort((a, b) => a.startOffset - b.startOffset);

    let metadata = `;FFMETADATA1
AirDate=${recording.actualStartTime}
Date=${recording.originalAirdate}
RecordingTimestamp=${recording.actualStartTime}
show=${recording.collectionTitle}
season_number=${recording.seasonNumber}
comment=${recording.description}
title=${recording.collectionTitle}

`;
    let id = 1;
    let skipId = 1;
    let lastEnd = 0;
    for (const chaper of segments) {
        const start = chaper.startOffset - offset;
        const end = chaper.endOffset - offset;

        if (start - lastEnd > 10000) {//if it's more then a 10 second gap lets make an ad chapter
            metadata += `[CHAPTER]
TIMEBASE=1/1000
START=${lastEnd}
END=${start}
title=Skip ${skipId++}

`;
        }
        lastEnd = end;

        metadata += `[CHAPTER]
TIMEBASE=1/1000
START=${start}
END=${end}
title=Content ${id++}

`
    }

    const outName = formatName(recording) + '.txt';
    //console.log(metadata);
    fs.writeFileSync(outName, metadata);    
}

if (process.argv.length < 3) {
    console.error ('this requires a recording ID');
} else {
    doit(process.argv[2]);
}
