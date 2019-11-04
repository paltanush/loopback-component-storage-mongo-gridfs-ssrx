# loopback-component-storage-mongo-gridfs

Uses mongoDB [GridFS](https://docs.mongodb.org/manual/core/gridfs/) to manage binary contents of your loopback application.

### Inspired by
* https://github.com/strongloop/loopback-component-storage
* https://github.com/jdrouet/loopback-component-storage-mongo
* https://github.com/jdrouet/loopback-component-storage-gridfs

### Behaviors

* Files are identified by id, not by file name. So it is possible to have files of the same name in one container.

* Files are identified by filename too.

* Delete file chunks on file or container erasing.

* Download file in line mode.

## Installation

```bash
npm install --save loopback-component-storage-mongo-gridfs
```

## Datasource

Add datasource to your datasources.json

```json
"storage": {
   "name": "gridfs",
   "connector": "loopback-component-storage-mongo-gridfs",
   "host": "hostname",
   "port": 27017,
   "database": "database",
   "username": "username",
   "password": "password"
 }
```

**username** and **password** are optional

## API

### List containers

```
GET /FileContainers
```
```javascript
FileContainer.getContainers();
```
<hr>

### Elimina toso los ficheros que cumplen con la condición

```
DELETE /FileContainers/delete/:where
```
```javascript
FileContainer.delete({
  where: 'where'
});
```

<hr>

### Delete container

```
DELETE /FileContainers/:containerName
```
```javascript
FileContainer.deleteContainer({
  containerName: 'containerName',
  fileId: 'fileId'
});
```

  * **containerName** - name of container to delete

<hr>

### List files in container

```
GET /FileContainers/:containerName/files
```
```javascript
FileContainer.getFiles({
  containerName: 'containerName'
});
```

  * **containerName** - name of container

Errors:
* **404** File not found.

<hr>

### Get file information

```
GET /FileContainers/:containerName/files/:fileId
```
```javascript
FileContainer.getFile({
  containerName: 'containerName',
  fileId: 'fileId'
});
```

  * **containerName** - name of container
  * **fileId** - id of file

<hr>

### Get file information by name

```
GET /FileContainers/:containerName/getFileByName/:filename
```
```javascript
FileContainer.getFileByName({
  containerName: 'containerName',
  filename: 'filename'
});
```

  * **containerName** - name of container
  * **filename** - name of file

<hr>

### Delete file

```
DELETE /FileContainers/:containerName/files/:fileId
```
```javascript
FileContainer.deleteFile({
  containerName: 'containerName',
  fileId: 'fileId'
});
```

* **containerName** - name of container
* **fileId** - id of file to delete

<hr>

### Delete file by fileId

```
DELETE /FileContainers/files/:fileId
```
```javascript
FileContainer.deleteFileByFileId({
  fileId: 'fileId'
});
```

* **fileId** - id of file to delete

<hr>

### Delete file by filename

```
DELETE /FileContainers/:containerName/deleteFileByName/:filename
```
```javascript
FileContainer.deleteFileByName({
  containerName: 'containerName',
  filename: 'filename'
});
```

* **containerName** - name of container
* **filename** - name of file to delete

<hr>

### Upload files

```
POST /FileContainers/:containerName/upload
```

* **containerName** - name of container

<hr>

### Download file

```
GET /FileContainers/download
```

* **fileId** - id of file to download

Errors:
* **404** File not found.

<hr>

### Download container as zip file

```
GET /FileContainers/:containerName/zip
```

* **containerName** - name of container

Errors:
* **404** No files to archive.

<hr>

### Download files zip

```
GET /FileContainers/downloadZipFiles
```

* **filesId** - string with ids of files to download

Errors:
* **404** File not found.

<hr>

### Download file inline

```
GET /FileContainers/downloadInline/:fileId
```

* **fileId** - id of file to download in line

Errors:
* **404** File not found.

<hr>

### Get steam file by FileId

```
GET /FileContainers/getStreamFileId/:fileId
```

* **fileId** - id of file to stream

Errors:
* **404** File not found.