-- QA #19: a lone «لبيد» reads as the Companion poet Labid ibn Rabi'a. Rename stored sheikhs.
update tribes set sheikh_name = 'مهلهل' where sheikh_name = 'لبيد';

-- QA #17: tribe names after a preposition take the genitive («نصر على بني …»).
-- Fix report text already written with «بنو».
update reports set
  title = regexp_replace(title, '(على|أمام|من|مع) بنو ', '\1 بني ', 'g'),
  body = regexp_replace(body, '(على|أمام|من|مع) بنو ', '\1 بني ', 'g')
where title ~ '(على|أمام|من|مع) بنو ' or body ~ '(على|أمام|من|مع) بنو ';
