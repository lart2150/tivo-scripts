'use strict'

export const formatName = (recordingInfo) => {
    let filename = recordingInfo.title;

    if (recordingInfo.collectionType === 'series') {
        if (recordingInfo.episodeNum && recordingInfo.seasonNumber) {
            const episode =String(recordingInfo.episodeNum[0]).padStart(2, '0');
            filename += ` - ${recordingInfo.seasonNumber}x${episode}`;
        }
        if (recordingInfo.subtitle) {
            filename += ` - ${recordingInfo.subtitle}`;
        }
    } else {
        if (recordingInfo.movieYear) {
            filename += ` (${recordingInfo.movieYear})`;
        }
    }
    return filename;
}