import { uid } from "./uid.js";
import { state } from "./data.js";

const IDB = (function init() {
  let db = null;
  let objectStore = null;

  // the request, which creates indexedDB
  let DBOpenReq = indexedDB.open("WhiskeyDB", 3);

  // three must have event listeners for indexedDB: error, success, upgradeneeded
  DBOpenReq.addEventListener("error", function (err) {
    // Error ocurred while trying to open DB
    console.warn("Error while trying to open database ->", err);
  });

  DBOpenReq.addEventListener("success", function (event) {
    // DB has successfully been opened, or we've upgraded it and opened it
    db = event.target.result;

    console.log("Database has been opened...", event.target.result);

    // load default testing data from a data file
    if (typeof state !== "undefined") {
      let transaction = makeTransaction("whiskeyStore");

      transaction.oncomplete = (ev) => {
        console.log("Transaction with getting test data completed...", ev);
        buildWhiskeyList();
      };

      let store = transaction.objectStore("whiskeyStore");
      let getAllRequest = store.getAll();

      getAllRequest.onsuccess = (ev) => {
        if (ev.target.result.length === 0) {
          // if db is empty, add data
          state.forEach((whiskeyObj) => {
            let addReq = store.add(whiskeyObj);

            addReq.addEventListener("success", (ev) => {
              console.log("Whiskey added to DB object...", ev);
            });

            // transaction.abort() - kills the transaction

            addReq.addEventListener("error", (err) => {
              console.warn("Error adding whiskey to DB...", err);
            });
          });
        }
      };
    } else {
      buildWhiskeyList();
    }
  });

  DBOpenReq.addEventListener("upgradeneeded", function (event) {
    // Triggers when DB version is changed (here we can create/delete object stores, modify indexes)
    console.log("Upgrade needed executing...", event);
    db = event.target.result;

    if (db.objectStoreNames.contains("whiskeyStore")) {
      db.deleteObjectStore("whiskeyStore"); // if object store exists, delete it
    }

    // keypath is going to be inserted into the objects inside the object store (unique value for each of the objects)
    objectStore = db.createObjectStore("whiskeyStore", { keyPath: "id" }); // id will be unique and required for each object

    // creating indexes for the object store (1st - index name, 2nd - keypath, 3rd - options)
    objectStore.createIndex("nameIDX", "name", { unique: false }); // allows duplicates
    objectStore.createIndex("countryIDX", "country", { unique: false });
    objectStore.createIndex("ageIDX", "age", { unique: false });
    objectStore.createIndex("editIDX", "lastEdit", { unique: false });
  });

  // ADD NEW ITEM TO DB
  document.getElementById("btnAdd").addEventListener("click", function (event) {
    event.preventDefault();

    // step 1: get the values from the form
    const { name, country, age, isOwned } = document.whiskeyForm;

    let whiskey = {
      id: uid(),
      name: name.value.trim(),
      country: country.value.trim(),
      age: age.value.trim(),
      isOwned: isOwned.checked,
      lastEdit: Date.now(),
    };

    // step 2: open a transaction (1st - object store name, 2nd - mode read/write)
    let transaction = makeTransaction("whiskeyStore");

    transaction.oncomplete = function (event) {
      // this will trigger when ALL requests were successful in transaction
      console.log("Transaction completed...", event);
      buildWhiskeyList();
      clearForm();
    };

    // step 3: point to the store object (or index) we're making requests to
    let store = transaction.objectStore("whiskeyStore");

    // step 4: make a request to the store object (or index)
    let request = store.add(whiskey);

    request.addEventListener("success", function (event) {
      console.log("Whiskey added to DB...", event);
    });
  });

  // UPDATE ITEM IN DB
  document.getElementById("btnUpdate").addEventListener("click", (event) => {
    event.preventDefault();

    // same logic as adding new item:
    const { name, country, age, isOwned } = document.whiskeyForm;
    const key = document.whiskeyForm.getAttribute("data-key");

    if (key) {
      let whiskey = {
        id: key,
        name: name.value.trim(),
        country: country.value.trim(),
        age: age.value.trim(),
        isOwned: isOwned.checked,
        lastEdit: Date.now(),
      };

      let transaction = makeTransaction("whiskeyStore");

      transaction.oncomplete = function (event) {
        // this will trigger when ALL requests were successful in transaction
        console.log("Transaction completed...", event);
        buildWhiskeyList();
        clearForm();
      };

      let store = transaction.objectStore("whiskeyStore");
      let request = store.put(whiskey); // put will update the record if it exists

      request.addEventListener("success", function (event) {
        console.log("Whiskey was updated in DB...", event);
      });
    }
  });

  // DELETE ITEM FROM DB
  document.getElementById("btnDelete").addEventListener("click", (event) => {
    event.preventDefault();

    // here we need only the key to delete item from DB
    const key = document.whiskeyForm.getAttribute("data-key");

    if (key) {
      let transaction = makeTransaction("whiskeyStore");

      transaction.oncomplete = function (event) {
        // this will trigger when ALL requests were successful in transaction
        console.log("Transaction completed...", event);
        buildWhiskeyList();
        clearForm();
      };

      let store = transaction.objectStore("whiskeyStore");
      let request = store.delete(key); // will delete the record with the key
      // to remove all data from indexedDB, use .clear() method

      request.addEventListener("success", function (event) {
        console.log("Whiskey was deleted in DB...", event);
      });
    }
  });

  function buildWhiskeyList() {
    const list = document.querySelector(".wList");
    list.innerHTML = `<li>Loading...</li>`;

    let transaction = makeTransaction("whiskeyStore", "readonly"); // readonly is for getting the data

    transaction.oncomplete = function (event) {
      // transaction for reading data is completed
    };

    let store = transaction.objectStore("whiskeyStore");
    // let getReq = store.getAll();
    // this will get all the records from the whiskeyStore as array
    // optional parameter for getAll is key or keyRange

    // for ranges refer to: https://developer.mozilla.org/en-US/docs/Web/API/IDBKeyRange
    const range = IDBKeyRange.lowerBound(14); // gets all records with age >= 5

    // Getting all data by index (data is sorted)
    let idx = store.index("ageIDX");
    let getReq = idx.getAll(range); 

    getReq.addEventListener("success", function (event) {
      // getAll was successful
      let request = event.target; // request === getReq === IDBRequest
      console.log({ request });
      list.innerHTML = request.result
        .map((whiskey) => {
          return `<li data-key=${whiskey.id}>${whiskey.name} - ${whiskey.country} - ${whiskey.age}</li>`;
        })
        .join("\n");
    });

    getReq.addEventListener("error", function (error) {
      console.warn("Error getting all whiskey data...", error);
    });
  }

  // making get request for a single whiskey
  document.querySelector(".wList").addEventListener("click", (ev) => {
    const liEl = ev.target.closest("li"); // also could write "[data-key]"
    const key = liEl.dataset.key; // extracting data-key attribute from the li element

    const transaction = makeTransaction("whiskeyStore", "readonly");

    transaction.oncomplete = function (event) {
      // transaction for reading data is completed
    };

    const store = transaction.objectStore("whiskeyStore");
    const getReq = store.get(key); // this will get the record using the key

    getReq.addEventListener("success", function (event) {
      const request = event.target;
      console.log({ request });
      const whiskey = request.result;

      document.whiskeyForm.name.value = whiskey.name;
      document.whiskeyForm.country.value = whiskey.country;
      document.whiskeyForm.age.value = whiskey.age;
      document.whiskeyForm.isOwned.checked = whiskey.isOwned;
      document.whiskeyForm.setAttribute("data-key", whiskey.id);
    });

    getReq.addEventListener("error", function (error) {
      console.warn("Error getting individual whiskey data...", error);
    });
  });

  function makeTransaction(storeName, mode = "readwrite") {
    const tx = db.transaction(storeName, mode);

    tx.onerror = function (error) {
      // this will trigger when ANY request failed in transaction
      console.warn("Transaction failed...", error);
    };

    return tx;
  }

  document.getElementById("btnClear").addEventListener("click", clearForm);

  function clearForm(ev) {
    if (ev) ev.preventDefault();
    document.whiskeyForm.removeAttribute("data-key");
    document.whiskeyForm.reset(); // WOW! this is so cool!
  }
})();
