// Utilities for accessing the git repository containing a base version of the code.

var fs = require("fs");
var pathlib = require("path");

var settings = require("./settings.js");

function execute_git(args, env, callback) {
	// Executes 'git' in a shell, captures its output to stdout,
	// and sends that output to 'callback'.
	//
	// If installing nodegit worked I'd use that, but since that's
	// tricky and involves compiling C code this is more portable
	// anyway, perhaps.

	var child_process = require("child_process");
	var output = "";
	var git = child_process.spawn(
		"git",
		args,
		{
			env: env,
			encoding: 'utf8',
			cwd: settings.code_directory
		});
	git.stdout.on('data', function (data) {
	  output += data;
	});
	git.on('close', function(exit_code) {
		if (exit_code != 0) throw "git returned non-zero exit status. Arguments: " + args.join(", ") + ". Output: " + output;
		callback(output);
	});
}

exports.get_repository_head = function(callback) {
	// Gets the hash corresponding to the head commit of the main branch (asynchronously).
	execute_git(["show", settings.code_branch], null, function(output) {
		var first_line = output.split("\n")[0].split(" ");
		if (first_line[0] != "commit") throw "invalid git output";
		callback(first_line[1]);
	});
}

exports.ls = function(hash, path, recursive, callback) {
	// Gets the directory listing corresponding to a commit hash and a particular
	// path (null for the root path), asynchronously.
	//
	// Calls callback with an array of directory entries, each an object with
	// 'name', 'hash', 'type', and 'size' properties. Type is 'blob' (file) or
	// 'tree' (directory).
	//
	// In the git call below, '-z' turns on null byte line endings, '-l' adds
	// file sizes, and '-r' produces recursive output.

	// To get the listings inside a directory, the path must end in a slash.
	if (path && path[path.length-1] != '/') path += '/';

	execute_git(["ls-tree", "-lz" + (recursive ? 'r' : ''), hash, (!path ? '' : path)], null,
	function(output) {
		var raw_entries = output.split("\0");
		var entries = [];
		raw_entries.forEach(function(item) {
			if (item.length == 0) return;
			item = item.split("\t");
			var filename = item[1];
			item = item[0].split(" ");

			// returned entries should be relative paths instead of
			// absolute paths
			if (path) {
				if (filename.substring(0, path.length) != path) throw "Invalid path?";
				filename = filename.substring(path.length);
			}

			entries.push({
				type: item[1],
				hash: item[2],
				size: item[3],
				name: filename
			})
		});
		callback(entries);
	});
}

exports.cat_hash = function(hash, callback) {
	// Gets the (string) content of a blob, i.e. a file, given its hash.
	execute_git(["show", hash], null, callback);
}

exports.cat = function(hash, path, callback) {
	// Gets the (string) content of a blob, i.e. a file, given its hash.
	execute_git(["show", hash + ":" + path], null, callback);
}

exports.clean_working_tree = function(callback) {
	// Calls "git reset --hard".
	execute_git(["reset", "--hard" ], null, function(output) { callback(); });
}

exports.write_working_tree_path = function(path, content, callback) {
	// Writes the content to the working tree path. 
	var mkdirp = require('mkdirp');
	var fn = pathlib.join(settings.code_directory, path);
	mkdirp(pathlib.dirname(fn), function(err) {
		if (err)
			callback(err)
		else
			fs.writeFile(fn, content, callback);
	});
}

exports.delete_working_tree_path = function(path, callback) {
	var fn = pathlib.join(settings.code_directory, path);
	fs.unlink(fn, function(err) { callback(); }) // ignore error (hmmm...)
}

exports.commit = function(message, author_name, author_email, callback) {
	// Performs a commit using "git add -A" and "git commit".
	execute_git(["add", "-A"], null, function() {
		execute_git(["status"], null, function(status_output) {
			if (status_output.indexOf("nothing to commit, working directory clean") != -1) {
				// Nothing to commit. Silently don't do a commit.
				callback("Nothing to commit.");
				return;
			}

			execute_git(
				["commit",  "-m", message],
				{
		           GIT_AUTHOR_NAME: author_name,
		           GIT_AUTHOR_EMAIL: author_email,
		           //GIT_AUTHOR_DATE
		           GIT_COMMITTER_NAME: author_name,
		           GIT_COMMITTER_EMAIL: author_email
		           //GIT_COMMITTER_DATE
				},
				callback
			);		
		});
	})
}
