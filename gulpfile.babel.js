import del from 'del';

import gulp from 'gulp';
import babel from 'gulp-babel';
import insert from 'gulp-insert';
import chmod from 'gulp-chmod';
import streamqueue from 'streamqueue';

gulp.task('compile-babel', compileBabel);

gulp.task('build', ['lib-clean'], compileBabel);

gulp.task('lib-clean', (cb) => {
  del('lib/*', { dot: true })
    .then(() => cb());
});

/////////////////////////////////////////////////////////////

function compileBabel() {
  return streamqueue({ objectMode: true },
    gulp.src('./src/index.js', { base: './src' })
      .pipe(babel())
      .pipe(insert.prepend('#!/usr/bin/env node\n'))
      .pipe(chmod(755)),
    gulp.src(['./src/**/*.js', '!./src/index.js'], { base: './src' })
      .pipe(babel())
  )
  .pipe(gulp.dest('./lib/'));
}
